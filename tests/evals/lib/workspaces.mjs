// Docusaurus sites for outcome evals. Templates are built once and cached
// under .mcp-evals/cache; each trial gets its own copy (an APFS clone on
// macOS, so a copy with node_modules is instant).
//
// - fresh:  `create-docusaurus` classic (JavaScript), installed, committed
// - set-up: fresh + this package from the local registry, added to the config
//           and built, as the setup guide leaves a site. Keyed by the packed
//           tarball, so it's rebuilt when the package changes.
//
// The agent's own installs use the public registry, through whatever wraps
// npm in the user's shell (Claude Code's Bash tool loads it). A wrapper such
// as Socket Firewall (`sfw`) allows only the public registry, so trials don't
// point npm at the local one: a `fresh` site installs the published package.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const run = (command, args, cwd, env = {}) =>
  execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

// The trial's own repo, for diffing what the agent changed. Never sign its
// commits: a global commit.gpgsign would ask the user's signer each trial.
const git = (cwd, ...args) =>
  run(
    'git',
    [
      '-c',
      'user.name=eval',
      '-c',
      'user.email=eval@example.com',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'tag.gpgsign=false',
      ...args,
    ],
    cwd
  );

/** Copies a directory tree, cloning files on macOS. */
export function cloneDir(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  run('cp', process.platform === 'darwin' ? ['-cR', from, to] : ['-R', from, to], process.cwd());
}

/** Writes an .npmrc that installs this package from the local registry. */
export function pointAtRegistry(dir, registryUrl) {
  fs.writeFileSync(
    path.join(dir, '.npmrc'),
    `registry=${registryUrl}\naudit=false\nfund=false\nupdate-notifier=false\n`
  );
}

/** The Docusaurus version the docs site uses, so templates match it. */
function docusaurusVersion(repo) {
  const pkg = path.join(repo, 'website', 'node_modules', '@docusaurus', 'core', 'package.json');
  return JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
}

function ensureFresh(repo, cacheDir) {
  const version = docusaurusVersion(repo);
  const dir = path.join(cacheDir, `fresh-${version}`);
  if (fs.existsSync(path.join(dir, '.ready'))) return dir;

  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  console.log(`[evals] Creating a Docusaurus ${version} site (once)...`);
  run(
    'npx',
    [
      '--yes',
      `create-docusaurus@${version}`,
      path.basename(dir),
      'classic',
      '--javascript',
      '--skip-install',
      '--package-manager',
      'npm',
    ],
    cacheDir
  );
  run('npm', ['install', '--no-audit', '--no-fund'], dir);
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\nbuild/\n.docusaurus/\n.eval/\n');
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'create-docusaurus');
  fs.writeFileSync(path.join(dir, '.ready'), '');
  return dir;
}

/** Adds the plugin to a fresh site's config, as step 2 of the setup guide does. */
function addPluginToConfig(dir) {
  const configPath = path.join(dir, 'docusaurus.config.js');
  const config = fs.readFileSync(configPath, 'utf8');
  const plugin = `  plugins: [\n    [\n      'docusaurus-plugin-mcp-server',\n      {\n        server: { name: 'my-docs', version: '1.0.0' },\n      },\n    ],\n  ],\n\n  presets: [`;
  if (!config.includes('\n  presets: ['))
    throw new Error('Unexpected docusaurus.config.js: no presets');
  fs.writeFileSync(configPath, config.replace('\n  presets: [', `\n${plugin}`));
}

function ensureSetUp(repo, cacheDir, pkg, registryUrl) {
  const dir = path.join(cacheDir, `set-up-${pkg.shasum.slice(0, 10)}`);
  if (fs.existsSync(path.join(dir, '.ready'))) return dir;

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('[evals] Setting up the plugin in a site template (once per package build)...');
  cloneDir(ensureFresh(repo, cacheDir), dir);
  fs.rmSync(path.join(dir, '.ready'));
  pointAtRegistry(dir, registryUrl);
  run('npm', ['install', `${pkg.name}@${pkg.version}`], dir);
  addPluginToConfig(dir);
  run('npm', ['run', 'build'], dir);
  fs.rmSync(path.join(dir, '.npmrc'));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'Add docusaurus-plugin-mcp-server');
  fs.writeFileSync(path.join(dir, '.ready'), '');
  return dir;
}

/**
 * Makes a trial's site at `dest`: a copy of the template with `files`
 * (relative path → content) written over it and committed, so `git status`
 * in the trial shows only what the agent changed.
 */
export function prepareWorkspace({ repo, cacheDir, pkg, registryUrl, site, files, dest }) {
  const template =
    site === 'fresh' ? ensureFresh(repo, cacheDir) : ensureSetUp(repo, cacheDir, pkg, registryUrl);
  cloneDir(template, dest);
  fs.rmSync(path.join(dest, '.ready'), { force: true });
  for (const [file, content] of Object.entries(files ?? {})) {
    const full = path.join(dest, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  git(dest, 'add', '-A');
  git(dest, 'commit', '-qm', 'Trial setup', '--allow-empty');
  return dest;
}

/** What the agent changed in the workspace, for the judge and for review. */
export function workspaceChanges(dir) {
  git(dir, 'add', '-A');
  return {
    status: git(dir, 'status', '--porcelain'),
    diff: git(dir, 'diff', '--cached', '--', '.', ':(exclude)package-lock.json').slice(0, 200_000),
  };
}
