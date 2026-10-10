// Copies the agent guides this site compiles into the repository's skills/
// directory, so `npx skills add scalvert/docusaurus-plugin-mcp-server`
// installs the same skills the site's MCP endpoint serves. The pages are the
// source: edit the page, build the site, then run `npm run skills:sync`.
//
//   node scripts/sync-skills.mjs          write skills/<guide>/ from the build
//   node scripts/sync-skills.mjs --check  exit 1 if skills/ doesn't match it
//
// Only guide skills (frontmatter metadata `agent-guide`) are managed here. A
// guide directory whose guide is gone is removed; hand-written skills, such as
// skills/docusaurus-plugin-mcp-server, are left alone.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const website = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bundlePath = path.join(website, 'build', 'mcp', 'bundle.json');
const skillsDir = path.join(website, '..', 'skills');
const check = process.argv.includes('--check');

const isGuide = (skill) => Boolean(skill.frontmatter?.metadata?.['agent-guide']);

/** The files a skill directory should hold: relative path -> text. */
function expectedFiles(skill) {
  return new Map(skill.files.map((file) => [file.path, file.text]));
}

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

/** Directories under skills/ that hold a compiled guide (from an earlier sync). */
async function guideDirs() {
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const dirs = [];
  for (const entry of entries.filter((e) => e.isDirectory())) {
    const skillMd = await fs
      .readFile(path.join(skillsDir, entry.name, 'SKILL.md'), 'utf8')
      .catch(() => '');
    if (/^---\n[\s\S]*?\n {2}agent-guide: /m.test(skillMd)) dirs.push(entry.name);
  }
  return dirs;
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
  const dir = path.join(skillsDir, skill.skillPath);
  const expected = expectedFiles(skill);
  const actual = await listFiles(dir);
  for (const [file, text] of expected) {
    const current = await fs.readFile(path.join(dir, file), 'utf8').catch(() => undefined);
    if (current === text) continue;
    problems.push(
      `skills/${skill.skillPath}/${file} ${current === undefined ? 'is missing' : 'is out of date'}`
    );
    if (!check) {
      await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await fs.writeFile(path.join(dir, file), text);
    }
  }
  for (const file of actual.filter((f) => !expected.has(f))) {
    problems.push(`skills/${skill.skillPath}/${file} isn't in the compiled guide`);
    if (!check) await fs.rm(path.join(dir, file));
  }
}

for (const dir of (await guideDirs()).filter((name) => !names.has(name))) {
  problems.push(`skills/${dir}/ is a guide the site no longer has`);
  if (!check) await fs.rm(path.join(skillsDir, dir), { recursive: true });
}

if (check && problems.length > 0) {
  console.error(
    `skills/ doesn't match the guides this site compiles:\n${problems.map((p) => `  - ${p}`).join('\n')}\n` +
      'The pages are the source. In website/, run `npm run build && npm run skills:sync`, and commit skills/.'
  );
  process.exit(1);
}
console.log(
  check
    ? `skills/ matches the ${guides.length} compiled guide(s).`
    : `Synced ${guides.length} guide(s) to skills/${problems.length > 0 ? ` (${problems.length} change(s))` : ''}.`
);
