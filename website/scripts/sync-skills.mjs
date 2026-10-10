// Copies the agent guides this site compiles into the repository's
// skills/guides/ directory, so `npx skills add scalvert/docusaurus-plugin-mcp-server`
// installs the same skills the site's MCP endpoint serves. The pages are the
// source: edit the page, build the site, then run `npm run skills:sync`.
//
//   node scripts/sync-skills.mjs          write skills/guides/<guide>/ from the build
//   node scripts/sync-skills.mjs --check  exit 1 if skills/guides/ doesn't match it
//
// skills/guides/ holds only compiled guides, so a directory there whose guide
// is gone is removed. The guides sit a level below the hand-written skills in
// skills/<name>/, which the agent baseline check (configure-agents) holds to
// the library-skill shape; the skills CLI finds both.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const website = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bundlePath = path.join(website, 'build', 'mcp', 'bundle.json');
const guidesDir = path.join(website, '..', 'skills', 'guides');
const shown = (...parts) => ['skills/guides', ...parts].join('/');
const check = process.argv.includes('--check');

const isGuide = (skill) => Boolean(skill.frontmatter?.metadata?.['agent-guide']);

async function listFiles(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(path.join(dir, entry.name), relative)));
    else files.push(relative);
  }
  return files;
}

async function guideDirs() {
  const entries = await fs.readdir(guidesDir, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

const bundle = JSON.parse(await fs.readFile(bundlePath, 'utf8').catch(() => 'null'));
if (!bundle) {
  console.error(
    `No ${path.relative(process.cwd(), bundlePath)}. Build the site first (npm run build).`
  );
  process.exit(1);
}

const guides = (bundle.skills?.skills ?? []).filter(isGuide);
const names = new Set(guides.map((skill) => skill.skillPath));
const problems = [];

for (const skill of guides) {
  const dir = path.join(guidesDir, skill.skillPath);
  const expected = new Map(skill.files.map((file) => [file.path, file.text]));
  for (const [file, text] of expected) {
    const current = await fs.readFile(path.join(dir, file), 'utf8').catch(() => undefined);
    if (current === text) continue;
    problems.push(
      `${shown(skill.skillPath, file)} ${current === undefined ? 'is missing' : 'is out of date'}`
    );
    if (!check) {
      await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await fs.writeFile(path.join(dir, file), text);
    }
  }
  for (const file of (await listFiles(dir)).filter((f) => !expected.has(f))) {
    problems.push(`${shown(skill.skillPath, file)} isn't in the compiled guide`);
    if (!check) await fs.rm(path.join(dir, file));
  }
}

for (const dir of (await guideDirs()).filter((name) => !names.has(name))) {
  problems.push(`${shown(dir)}/ is a guide the site no longer has`);
  if (!check) await fs.rm(path.join(guidesDir, dir), { recursive: true });
}

if (check && problems.length > 0) {
  console.error(
    `skills/guides/ doesn't match the guides this site compiles:\n${problems.map((p) => `  - ${p}`).join('\n')}\n` +
      'The pages are the source. In website/, run `npm run build && npm run skills:sync`, and commit skills/guides/.'
  );
  process.exit(1);
}
console.log(
  check
    ? `skills/guides/ matches the ${guides.length} compiled guide(s).`
    : `Synced ${guides.length} guide(s) to skills/guides/${problems.length > 0 ? ` (${problems.length} change(s))` : ''}.`
);
