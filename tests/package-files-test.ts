import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

describe('published package contents', () => {
  it('includes the built-in skills (loaded from disk at build time)', () => {
    const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: root,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    const [pack] = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;
    const paths = pack!.files.map((f) => f.path.replace(/\\/g, '/'));

    expect(paths).toContain('skills-builtin/docs-research/SKILL.md');
  });
});
