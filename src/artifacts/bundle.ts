/**
 * The artifact bundle: everything a documentation server needs to run.
 *
 * This module owns the bundle's shape, its member names on disk, its format
 * version, and its validation. Build code assembles a bundle with
 * `buildArtifactBundle`; runtime code checks one with `parseArtifactBundle`.
 * Neither needs to know the filenames under `build/mcp/`.
 *
 * Edge-safe: no Node built-ins. File IO lives in `./node.ts`.
 *
 * See docs/adr/0001-single-artifact-bundle.md.
 */

import { ConfigurationError } from '../errors.js';
import type { McpManifest, ProcessedDoc, SkillsArtifact } from '../types/index.js';

/** Bundle layout version written to `bundle.json`. Bump when a required member changes. */
export const ARTIFACT_BUNDLE_FORMAT_VERSION = 1;

/** Filenames of the bundle members on disk, relative to the MCP output directory. */
export const ARTIFACT_FILES = {
  bundle: 'bundle.json',
  docs: 'docs.json',
  searchIndex: 'search-index.json',
  skills: 'skills.json',
  manifest: 'manifest.json',
} as const;

/**
 * Everything a documentation server needs to run, as produced by one build.
 */
export interface ArtifactBundle {
  /** Bundle layout version; see `ARTIFACT_BUNDLE_FORMAT_VERSION` */
  formatVersion: typeof ARTIFACT_BUNDLE_FORMAT_VERSION;
  /** The build that produced this bundle */
  manifest: McpManifest;
  /** Every document, keyed by document ID */
  docs: Record<string, ProcessedDoc>;
  /** Search index from the indexer that emitted `search-index.json`, if any. Opaque here. */
  searchIndex?: Record<string, unknown>;
  /** Skills served over MCP, if packaged */
  skills?: SkillsArtifact;
  /** Indexer extras, keyed by the filename the indexer chose. Opaque here. */
  extras?: Record<string, unknown>;
}

/**
 * Document ID: the full URL when a base URL is known, otherwise the route.
 */
export function documentId(doc: Pick<ProcessedDoc, 'route'>, baseUrl?: string): string {
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}${doc.route}` : doc.route;
}

/** What one indexer contributed during a build. */
export interface IndexerOutput {
  /** The indexer's `name` */
  name: string;
  /** What `finalize()` returned: filename -> JSON-serializable content */
  files: Map<string, unknown>;
  /** What `getManifestData()` returned, if implemented */
  manifestData?: Record<string, unknown>;
}

export interface BuildArtifactBundleInput {
  /** Every extracted document */
  docs: ProcessedDoc[];
  /** Absolute site URL including the Docusaurus base path */
  baseUrl: string;
  server: { name: string; version: string };
  /** Indexers that ran, in order */
  indexers: IndexerOutput[];
  skills?: SkillsArtifact;
  /** Defaults to now */
  buildTime?: string;
}

/** Names an indexer may not emit because the plugin writes them. */
const CORE_OWNED = new Set<string>([
  ARTIFACT_FILES.bundle,
  ARTIFACT_FILES.manifest,
  ARTIFACT_FILES.skills,
]);

/** Member filenames, compared as the filesystem may: case-insensitively. */
const MEMBER_FILES = new Set<string>(Object.values(ARTIFACT_FILES).map((f) => f.toLowerCase()));

/**
 * Where an extra lands on disk, as a comparison key: `/` separators and
 * lowercase, so names that collide on Windows or macOS compare equal.
 */
function extraKey(filename: string): string {
  return filename.replace(/\\/g, '/').toLowerCase();
}

/**
 * Throws on an extras filename that could escape the output directory or
 * overwrite a bundle member (`./manifest.json`, `Manifest.json`, ...).
 */
function assertExtraFilename(indexer: string, filename: string): void {
  const segments = filename.split(/[/\\]/);
  if (
    filename.length === 0 ||
    filename.startsWith('/') ||
    filename.startsWith('\\') ||
    /^[A-Za-z]:/.test(filename) ||
    segments.some((segment) => segment === '..' || segment === '.' || segment === '')
  ) {
    throw new ConfigurationError(
      `[MCP] Indexer "${indexer}" returned an invalid artifact filename "${filename}". ` +
        'Use a relative path inside the MCP output directory, such as "my-index.json".'
    );
  }
  if (MEMBER_FILES.has(extraKey(filename))) {
    throw new ConfigurationError(
      `[MCP] Indexer "${indexer}" returned ${filename}, which would overwrite a file the plugin writes. ` +
        'Rename the artifact in its finalize() result.'
    );
  }
}

/**
 * Assemble the artifact bundle for one build.
 *
 * Applies the member rules from ADR-0001:
 * - the plugin always writes documents; `docs.json` from an indexer is ignored
 * - `search-index.json` from an indexer becomes `searchIndex`; only one indexer may emit it
 * - `bundle.json`, `manifest.json`, and `skills.json` are reserved for the plugin
 * - any other file becomes an indexer extra
 */
export function buildArtifactBundle(input: BuildArtifactBundleInput): ArtifactBundle {
  const docs: Record<string, ProcessedDoc> = {};
  for (const doc of input.docs) {
    docs[documentId(doc, input.baseUrl)] = doc;
  }

  let searchIndex: Record<string, unknown> | undefined;
  let searchIndexOwner: string | undefined;
  const extras: Record<string, unknown> = {};
  const extrasOwner = new Map<string, { indexer: string; filename: string }>();
  const indexerData: Record<string, Record<string, unknown>> = {};

  for (const indexer of input.indexers) {
    if (indexer.manifestData !== undefined) {
      indexerData[indexer.name] = indexer.manifestData;
    }

    for (const [filename, content] of indexer.files) {
      if (filename === ARTIFACT_FILES.docs) {
        if (indexer.name !== 'local') {
          console.warn(
            `[MCP] Indexer "${indexer.name}" returned docs.json; the plugin writes documents itself, so it was ignored.`
          );
        }
        continue;
      }

      if (CORE_OWNED.has(filename)) {
        throw new ConfigurationError(
          `[MCP] Indexer "${indexer.name}" returned ${filename}, which the plugin writes itself. ` +
            'Rename the artifact in its finalize() result.'
        );
      }

      if (filename === ARTIFACT_FILES.searchIndex) {
        if (searchIndexOwner !== undefined) {
          throw new ConfigurationError(
            `[MCP] Indexers "${searchIndexOwner}" and "${indexer.name}" both returned search-index.json. ` +
              'Only one indexer may provide the search index; rename the other artifact.'
          );
        }
        if (typeof content !== 'object' || content === null || Array.isArray(content)) {
          throw new ConfigurationError(
            `[MCP] Indexer "${indexer.name}" returned a search-index.json that is not a JSON object.`
          );
        }
        searchIndex = content as Record<string, unknown>;
        searchIndexOwner = indexer.name;
        continue;
      }

      assertExtraFilename(indexer.name, filename);
      const key = extraKey(filename);
      const previous = extrasOwner.get(key);
      if (previous !== undefined) {
        const who =
          previous.indexer === indexer.name
            ? `Indexer "${indexer.name}" returned`
            : `Indexers "${previous.indexer}" and "${indexer.name}" both returned`;
        const what =
          previous.filename === filename
            ? filename
            : `${previous.filename} and ${filename}, the same file on case-insensitive filesystems`;
        throw new ConfigurationError(`[MCP] ${who} ${what}. Rename one of them.`);
      }
      extras[filename] = content;
      extrasOwner.set(key, { indexer: indexer.name, filename });
    }
  }

  const manifest: McpManifest = {
    version: input.server.version,
    buildTime: input.buildTime ?? new Date().toISOString(),
    docCount: input.docs.length,
    serverName: input.server.name,
    baseUrl: input.baseUrl,
    indexers: input.indexers.map((indexer) => indexer.name),
    ...(input.skills ? { skillCount: input.skills.skills.length } : {}),
    ...(Object.keys(indexerData).length > 0 ? { indexerData } : {}),
  };

  return {
    formatVersion: ARTIFACT_BUNDLE_FORMAT_VERSION,
    manifest,
    docs,
    ...(searchIndex ? { searchIndex } : {}),
    ...(input.skills ? { skills: input.skills } : {}),
    ...(Object.keys(extras).length > 0 ? { extras } : {}),
  };
}

const REBUILD = 'Rebuild the site (docusaurus build) and redeploy the MCP output directory.';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(source: string, problem: string): ConfigurationError {
  return new ConfigurationError(
    `[MCP] ${source} is not a valid artifact bundle: ${problem}. ${REBUILD}`
  );
}

/**
 * Check that `data` is an artifact bundle this runtime can serve.
 *
 * Validates the layout and the members the server itself reads (`manifest`,
 * `docs`). `searchIndex` and `skills` are checked by the code that reads them.
 * Every failure is a `ConfigurationError` that says how to fix it.
 *
 * @param source How to name the input in errors, e.g. `"bundle.json"`
 */
export function parseArtifactBundle(data: unknown, source = 'bundle.json'): ArtifactBundle {
  if (!isObject(data)) {
    throw invalid(source, 'expected a JSON object');
  }

  const { formatVersion } = data;
  if (typeof formatVersion !== 'number') {
    throw invalid(source, 'missing formatVersion');
  }
  if (formatVersion > ARTIFACT_BUNDLE_FORMAT_VERSION) {
    throw new ConfigurationError(
      `[MCP] ${source} has formatVersion ${formatVersion}, but this docusaurus-plugin-mcp-server ` +
        `runtime reads up to ${ARTIFACT_BUNDLE_FORMAT_VERSION}. Upgrade docusaurus-plugin-mcp-server ` +
        'where the server runs to the version that built the site.'
    );
  }
  if (formatVersion !== ARTIFACT_BUNDLE_FORMAT_VERSION) {
    throw invalid(source, `unsupported formatVersion ${formatVersion}`);
  }

  const { manifest, docs, searchIndex, skills, extras } = data;

  if (!isObject(manifest)) {
    throw invalid(source, 'missing manifest');
  }
  if (typeof manifest.serverName !== 'string' || typeof manifest.version !== 'string') {
    throw invalid(source, 'manifest needs string serverName and version');
  }
  if (typeof manifest.docCount !== 'number') {
    throw invalid(source, 'manifest needs a numeric docCount');
  }

  if (!isObject(docs)) {
    throw invalid(source, 'missing docs');
  }
  for (const [id, doc] of Object.entries(docs)) {
    if (
      !isObject(doc) ||
      typeof doc.route !== 'string' ||
      typeof doc.title !== 'string' ||
      typeof doc.markdown !== 'string'
    ) {
      throw invalid(source, `document "${id}" needs string route, title, and markdown`);
    }
  }

  if (searchIndex !== undefined && !isObject(searchIndex)) {
    throw invalid(source, 'searchIndex must be an object');
  }
  if (skills !== undefined && (!isObject(skills) || !Array.isArray(skills.skills))) {
    throw invalid(source, 'skills must be an object with a skills array');
  }
  if (extras !== undefined && !isObject(extras)) {
    throw invalid(source, 'extras must be an object');
  }

  return data as unknown as ArtifactBundle;
}
