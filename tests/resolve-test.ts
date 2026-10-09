import { describe, it, expect, vi } from 'vitest';
import { createResolver, type Resolved } from '../src/mcp/resolve.js';
import type { ProcessedDoc, SkillArtifact, SkillsArtifact } from '../src/types/index.js';

const BASE = 'https://docs.example.com/docs/';

function doc(route: string, title = route): ProcessedDoc {
  return { route, title, description: '', markdown: `# ${title}\n`, headings: [] };
}

/** Keyed the way the bundle keys them: base URL (no trailing slash) + route. */
const docs: Record<string, ProcessedDoc> = Object.fromEntries(
  [
    doc('/', 'Home'),
    doc('/intro', 'Introduction'),
    doc('/guides/setup', 'Setup guide'),
    doc('/api/setup', 'API setup'),
    doc('/reference/cli', 'CLI'),
  ].map((d) => [`https://docs.example.com/docs${d.route}`, d])
);

function skill(skillPath: string, paths: string[]): SkillArtifact {
  const name = skillPath.split('/').pop()!;
  return {
    skillPath,
    frontmatter: { name, description: `The ${name} skill` },
    files: paths.map((path) => ({
      path,
      mimeType: 'text/markdown',
      text: `${skillPath}/${path}`,
      digest: 'sha256:x',
      size: 1,
    })),
  };
}

const skills: SkillsArtifact = {
  version: 1,
  skills: [
    skill('setup', ['SKILL.md']),
    skill('setup-advanced', ['SKILL.md', 'references/errors.md']),
    skill('team/setup', ['SKILL.md']),
  ],
};

const bundleOnly = createResolver({ baseUrl: BASE, provider: {}, docs, skills });

/** The document ID a resolution landed on, or the kind when it isn't a document. */
function where(resolved: Resolved): string {
  if (resolved.kind === 'document') return resolved.id;
  if (resolved.kind === 'skill-file') return `skill-file ${resolved.uri}`;
  return `not-found ${resolved.tried}`;
}

describe('createResolver: document forms', () => {
  it.each([
    ['exact', 'https://docs.example.com/docs/intro', 'https://docs.example.com/docs/intro'],
    [
      'trailing slash',
      'https://docs.example.com/docs/intro/',
      'https://docs.example.com/docs/intro',
    ],
    [
      'fragment',
      'https://docs.example.com/docs/intro#overview',
      'https://docs.example.com/docs/intro',
    ],
    ['.md suffix', 'https://docs.example.com/docs/intro.md', 'https://docs.example.com/docs/intro'],
    [
      '.html suffix',
      'https://docs.example.com/docs/intro.html',
      'https://docs.example.com/docs/intro',
    ],
    [
      'index.html',
      'https://docs.example.com/docs/intro/index.html',
      'https://docs.example.com/docs/intro',
    ],
    [
      'query string',
      'https://docs.example.com/docs/intro?ref=x',
      'https://docs.example.com/docs/intro',
    ],
    ['root-relative path', '/docs/intro', 'https://docs.example.com/docs/intro'],
    [
      'root-relative with slash and fragment',
      '/docs/guides/setup/#step-2',
      'https://docs.example.com/docs/guides/setup',
    ],
    ['site root, no slash', 'https://docs.example.com/docs', 'https://docs.example.com/docs/'],
    ['site root, index.md', '/docs/index.md', 'https://docs.example.com/docs/'],
    [
      'uppercase host',
      'https://DOCS.example.com/docs/intro',
      'https://docs.example.com/docs/intro',
    ],
    [
      'surrounding whitespace',
      '  https://docs.example.com/docs/intro  ',
      'https://docs.example.com/docs/intro',
    ],
  ])('%s: %s', async (_name, uri, id) => {
    expect(where(await bundleOnly(uri))).toBe(id);
  });

  it('keeps the decoded fragment', async () => {
    const resolved = await bundleOnly('/docs/intro#caf%C3%A9');
    expect(resolved).toMatchObject({ kind: 'document', fragment: 'café' });
  });

  it('has no fragment for a bare #', async () => {
    const resolved = await bundleOnly('/docs/intro#');
    expect(resolved.kind === 'document' && 'fragment' in resolved).toBe(false);
  });

  it('does not rewrite other hosts', async () => {
    expect(where(await bundleOnly('http://localhost:3000/docs/intro'))).toBe(
      'not-found http://localhost:3000/docs/intro'
    );
  });
});

describe('createResolver: misses', () => {
  it('suggests documents ending in the same path segment, in ID order', async () => {
    expect(await bundleOnly('/docs/old/setup')).toEqual({
      kind: 'not-found',
      tried: 'https://docs.example.com/docs/old/setup',
      similar: [
        { id: 'https://docs.example.com/docs/api/setup', title: 'API setup' },
        { id: 'https://docs.example.com/docs/guides/setup', title: 'Setup guide' },
      ],
    });
  });

  it('caps suggestions at 3', async () => {
    const many = Object.fromEntries(
      ['a', 'b', 'c', 'd'].map((dir) => [`https://x.dev/${dir}/setup`, doc(`/${dir}/setup`)])
    );
    const resolve = createResolver({
      baseUrl: 'https://x.dev/',
      provider: {},
      docs: many,
      skills: null,
    });
    const resolved = await resolve('/old/setup');
    expect(resolved.kind === 'not-found' && resolved.similar.map((s) => s.id)).toEqual([
      'https://x.dev/a/setup',
      'https://x.dev/b/setup',
      'https://x.dev/c/setup',
    ]);
  });

  it('has no suggestions for an unmatched segment or the site root', async () => {
    expect(await bundleOnly('/docs/nothing-like-this')).toMatchObject({ similar: [] });
    expect(await bundleOnly('https://elsewhere.example.com/')).toMatchObject({ similar: [] });
  });
});

describe('createResolver: skills', () => {
  it.each([
    ['SKILL.md', 'skill://setup/SKILL.md', 'skill-file skill://setup/SKILL.md'],
    [
      'a nested file',
      'skill://setup-advanced/references/errors.md',
      'skill-file skill://setup-advanced/references/errors.md',
    ],
    [
      'a multi-segment skill path',
      'skill://team/setup/SKILL.md',
      'skill-file skill://team/setup/SKILL.md',
    ],
    [
      'a fragment, ignored',
      'skill://setup-advanced/references/errors.md#x',
      'skill-file skill://setup-advanced/references/errors.md',
    ],
    [
      'a file only a similarly named skill has',
      'skill://setup/references/errors.md',
      'not-found skill://setup/references/errors.md',
    ],
    ['an unknown skill', 'skill://nope/SKILL.md', 'not-found skill://nope/SKILL.md'],
  ])('%s', async (_name, uri, expected) => {
    expect(where(await bundleOnly(uri))).toBe(expected);
  });

  it('treats skill:// as an ordinary miss when no skills are served', async () => {
    const resolve = createResolver({ baseUrl: BASE, provider: {}, docs, skills: null });
    expect(where(await resolve('skill://setup/SKILL.md'))).toBe('not-found skill://setup/SKILL.md');
  });
});

describe('createResolver: lookup order with a provider', () => {
  const providerDoc = doc('/provider', 'From the provider');

  it('asks the provider with the URI as sent (minus the fragment) first', async () => {
    const sent = 'https://docs.example.com/docs/intro/';
    const getDocument = vi.fn(async (url: string) => (url === sent ? providerDoc : null));
    const resolve = createResolver({ baseUrl: BASE, provider: { getDocument }, docs, skills });
    expect(await resolve(`${sent}#a`)).toMatchObject({
      kind: 'document',
      id: sent,
      doc: providerDoc,
    });
    expect(getDocument.mock.calls).toEqual([[sent]]);
  });

  it('then asks with the document ID', async () => {
    const getDocument = vi.fn(async (url: string) =>
      url === 'https://docs.example.com/docs/intro' ? providerDoc : null
    );
    const resolve = createResolver({ baseUrl: BASE, provider: { getDocument }, docs, skills });
    expect(await resolve('https://docs.example.com/docs/intro.md')).toMatchObject({
      doc: providerDoc,
    });
    expect(getDocument.mock.calls).toEqual([
      ['https://docs.example.com/docs/intro.md'],
      ['https://docs.example.com/docs/intro'],
    ]);
  });

  // Before 2.3 the schema required a URL, and custom providers may call new URL() on it.
  it.each([
    [
      'a root-relative path, as its document ID',
      '/docs/intro',
      ['https://docs.example.com/docs/intro'],
    ],
    [
      'a root-relative path to an unknown page, resolved against the origin',
      '/docs/gone',
      ['https://docs.example.com/docs/gone'],
    ],
    [
      'text that is not a URL, resolved against the origin',
      'not a url',
      ['https://docs.example.com/not%20a%20url'],
    ],
  ])('only asks the provider with absolute URLs: %s', async (_name, uri, calls) => {
    const getDocument = vi.fn(async (url: string) => {
      new URL(url); // throws for anything that isn't absolute
      return null;
    });
    const resolve = createResolver({ baseUrl: BASE, provider: { getDocument }, docs, skills });
    await resolve(uri);
    expect(getDocument.mock.calls).toEqual(calls.map((url) => [url]));
  });

  it('asks once when the URI is already the document ID', async () => {
    const getDocument = vi.fn(async () => null);
    const resolve = createResolver({ baseUrl: BASE, provider: { getDocument }, docs, skills });
    await resolve('https://docs.example.com/docs/intro');
    expect(getDocument).toHaveBeenCalledTimes(1);
  });

  it('falls back to the bundle when the provider misses', async () => {
    const resolve = createResolver({
      baseUrl: BASE,
      provider: { getDocument: async () => null },
      docs,
      skills,
    });
    expect(await resolve('/docs/intro')).toMatchObject({
      kind: 'document',
      doc: docs['https://docs.example.com/docs/intro'],
    });
  });

  it('serves a provider-only URL the bundle does not have', async () => {
    const getDocument = async (url: string) =>
      url === 'https://cdn.example.com/x' ? providerDoc : null;
    const resolve = createResolver({ baseUrl: BASE, provider: { getDocument }, docs, skills });
    expect(await resolve('https://cdn.example.com/x')).toMatchObject({ doc: providerDoc });
  });

  it('propagates a provider error instead of falling back', async () => {
    const resolve = createResolver({
      baseUrl: BASE,
      provider: {
        getDocument: async () => {
          throw new Error('boom');
        },
      },
      docs,
      skills,
    });
    await expect(resolve('/docs/intro')).rejects.toThrow('boom');
  });

  it('does not ask the provider for skill URIs', async () => {
    const getDocument = vi.fn(async () => null);
    const resolve = createResolver({ baseUrl: BASE, provider: { getDocument }, docs, skills });
    await resolve('skill://setup/SKILL.md');
    expect(getDocument).not.toHaveBeenCalled();
  });
});

describe('createResolver: documents keyed by route (no base URL)', () => {
  const byRoute = { '/intro': doc('/intro'), '/guides/setup': doc('/guides/setup') };
  const resolve = createResolver({ provider: {}, docs: byRoute, skills: null });

  it.each([
    ['/intro', '/intro'],
    ['/intro/', '/intro'],
    ['/intro.md#x', '/intro'],
  ])('%s', async (uri, id) => {
    expect(where(await resolve(uri))).toBe(id);
  });

  it('names the route it tried on a miss', async () => {
    expect(where(await resolve('/gone/'))).toBe('not-found /gone');
  });

  it('never asks the provider with a route or the placeholder origin', async () => {
    const getDocument = vi.fn(async () => null);
    const withProvider = createResolver({ provider: { getDocument }, docs: byRoute, skills: null });
    expect(where(await withProvider('/intro'))).toBe('/intro');
    await withProvider('/gone');
    expect(getDocument).not.toHaveBeenCalled();
  });
});
