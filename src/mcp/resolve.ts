/**
 * Document resolution: whatever an agent passes to `docs_fetch`, to the
 * content it names.
 *
 * Agents pass document IDs in many forms: from search results, from links in
 * fetched pages (root-relative), from skills (`skill://`), with a trailing
 * slash, a `#fragment`, or a `.md`/`.html` suffix. Every such rule lives here,
 * so tools only format what comes back.
 *
 * Edge-safe: no Node built-ins.
 */

import type { ProcessedDoc, SkillFile, SkillsArtifact } from '../types/index.js';
import type { SearchRanker } from '../providers/types.js';
import { SKILL_URI_PREFIX, skillFileUri } from './skills.js';

/** What a URI resolved to. */
export type Resolved =
  | {
      kind: 'document';
      /** The document ID */
      id: string;
      doc: ProcessedDoc;
      /** The URI's fragment (decoded, without `#`), if it had one */
      fragment?: string;
    }
  | { kind: 'skill-file'; uri: string; file: SkillFile }
  | {
      kind: 'not-found';
      /** The canonical form that was looked up */
      tried: string;
      /** Up to {@link MAX_SIMILAR} documents whose path ends in the same segment */
      similar: Array<{ id: string; title: string }>;
    };

/** Resolve one URI. Rejects only if the search provider's `getDocument` throws. */
export type Resolve = (uri: string) => Promise<Resolved>;

export interface ResolverInput {
  /** Absolute site URL including the base path; root-relative paths resolve against its origin */
  baseUrl?: string;
  /** Asked first, when it implements `getDocument` */
  provider: Pick<SearchRanker, 'getDocument'>;
  /** The bundle's documents, keyed by document ID */
  docs: Record<string, ProcessedDoc>;
  /** Skills served by the server, if any; `skill://` URIs resolve only when set */
  skills: SkillsArtifact | null;
}

export const MAX_SIMILAR = 3;

/**
 * Origin for documents keyed by route (a server with no base URL), so routes
 * and root-relative paths normalize the same way.
 */
const ROUTE_ORIGIN = 'http://route.invalid';

/** `/a/index.html`, `/a.md`, `/a/` and `/a` all name `/a`. */
function normalizePath(pathname: string): string {
  const path = pathname
    .replace(/\/index\.(?:html|md)$/i, '/')
    .replace(/\.(?:html|md)$/i, '')
    .replace(/\/+$/, '');
  return path || '/';
}

interface Reference {
  /** Comparison key: origin plus normalized path, or the raw URI for other schemes */
  key: string;
  /** The URI without its fragment, as the agent sent it */
  withoutFragment: string;
  fragment?: string;
}

function parseReference(uri: string, origin: string): Reference | null {
  const hashAt = uri.indexOf('#');
  const withoutFragment = (hashAt === -1 ? uri : uri.slice(0, hashAt)).trim();
  let fragment: string | undefined;
  if (hashAt !== -1 && hashAt < uri.length - 1) {
    try {
      fragment = decodeURIComponent(uri.slice(hashAt + 1));
    } catch {
      fragment = uri.slice(hashAt + 1);
    }
  }

  let url: URL;
  try {
    url = new URL(withoutFragment, origin);
  } catch {
    return null;
  }
  const key =
    url.protocol === 'http:' || url.protocol === 'https:'
      ? `${url.origin}${normalizePath(url.pathname)}`
      : withoutFragment;
  return { key, withoutFragment, ...(fragment !== undefined ? { fragment } : {}) };
}

/**
 * Whether a string is an absolute URL on its own. `provider.getDocument` only
 * ever receives these: before 2.3 the `docs_fetch` schema required one, and
 * custom providers may parse the argument with `new URL()`.
 */
function isAbsoluteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** A key as agents should see it: route-keyed servers show the route, not the placeholder origin. */
function displayKey(key: string): string {
  return key.startsWith(`${ROUTE_ORIGIN}/`) ? key.slice(ROUTE_ORIGIN.length) : key;
}

/** The last path segment of a key, e.g. `setup` for `https://x.com/docs/setup` */
function lastSegment(key: string): string {
  const path = key.replace(/^[a-z]+:\/\/[^/]*/i, '');
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Build the resolver for one server. Indexes the documents and skill files
 * once; each call then normalizes the URI and looks it up in this order:
 *
 * 1. a `skill://` URI, when skills are served (the fragment is ignored)
 * 2. `provider.getDocument` with the URI as sent (minus the fragment)
 * 3. `provider.getDocument` with the document ID, if that differs
 * 4. the bundle's documents
 *
 * The provider is only asked with absolute URLs, so a root-relative path
 * reaches it as its document ID. Hosts are never rewritten: a URI on another
 * host only matches if a provider recognizes it.
 */
export function createResolver(input: ResolverInput): Resolve {
  let origin = ROUTE_ORIGIN;
  if (input.baseUrl) {
    try {
      origin = new URL(input.baseUrl).origin;
    } catch {
      // An unparseable base URL leaves document IDs keyed as given.
    }
  }

  const idsByKey = new Map<string, string>();
  for (const id of Object.keys(input.docs)) {
    const ref = parseReference(id, origin);
    if (ref && !idsByKey.has(ref.key)) idsByKey.set(ref.key, id);
  }

  const skillFiles = new Map<string, SkillFile>();
  for (const skill of input.skills?.skills ?? []) {
    for (const file of skill.files) {
      skillFiles.set(skillFileUri(skill, file.path), file);
    }
  }

  const getDocument = input.provider.getDocument?.bind(input.provider);

  return async function resolve(uri) {
    const ref = parseReference(uri, origin);
    if (!ref) {
      return { kind: 'not-found', tried: uri.trim(), similar: [] };
    }
    const ask = async (url: string) =>
      getDocument && isAbsoluteUrl(url) && !url.startsWith(`${ROUTE_ORIGIN}/`)
        ? getDocument(url)
        : null;
    const document = (id: string, doc: ProcessedDoc): Resolved => ({
      kind: 'document',
      id,
      doc,
      ...(ref.fragment !== undefined ? { fragment: ref.fragment } : {}),
    });

    if (input.skills && ref.withoutFragment.startsWith(SKILL_URI_PREFIX)) {
      const file = skillFiles.get(ref.withoutFragment);
      return file
        ? { kind: 'skill-file', uri: ref.withoutFragment, file }
        : { kind: 'not-found', tried: ref.withoutFragment, similar: [] };
    }

    const id = idsByKey.get(ref.key);
    const asSent = await ask(ref.withoutFragment);
    if (asSent) return document(ref.withoutFragment, asSent);
    const canonical = id ?? ref.key;
    if (canonical !== ref.withoutFragment) {
      const found = await ask(canonical);
      if (found) return document(canonical, found);
    }

    if (id !== undefined) {
      const doc = input.docs[id];
      if (doc) return document(id, doc);
    }

    return { kind: 'not-found', tried: displayKey(canonical), similar: similarDocs(ref.key) };
  };

  function similarDocs(key: string): Array<{ id: string; title: string }> {
    const segment = lastSegment(key);
    if (!segment) return [];
    const matches: Array<{ id: string; title: string }> = [];
    for (const [candidateKey, id] of idsByKey) {
      if (candidateKey !== key && lastSegment(candidateKey) === segment) {
        matches.push({ id, title: input.docs[id]?.title ?? '' });
      }
    }
    return matches.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, MAX_SIMILAR);
  }
}
