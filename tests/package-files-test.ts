import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MIGRATION_GUIDE } from '../src/errors.js';

const root = fileURLToPath(new URL('..', import.meta.url));

describe('published package contents', () => {
  let paths: string[];

  beforeAll(() => {
    const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: root,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    const [pack] = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;
    paths = pack!.files.map((f) => f.path.replace(/\\/g, '/'));
  });

  it('includes the built-in skills (loaded from disk at build time)', () => {
    expect(paths).toContain('skills-builtin/docs-research/SKILL.md');
  });

  it("includes the plugin's theme (getThemePath)", () => {
    expect(paths).toContain('dist/theme-mdx/MDXComponents.js');
  });

  it('includes the 1.x -> 2.0 migration guide that errors and the repo skill point to', () => {
    expect(paths).toContain('migrations/1.x-2.0.0.md');
  });

  it('includes the 2.x -> 3.0 guide for the configs deprecated in 2.2', () => {
    expect(paths).toContain('migrations/2.x-3.0.0.md');
  });

  it('points errors at a migration guide that exists', () => {
    const relative = MIGRATION_GUIDE.split('/blob/main/')[1]!;
    expect(existsSync(new URL(`../${relative}`, import.meta.url))).toBe(true);
  });
});
