# docusaurus-plugin-mcp-server

Turns a built Docusaurus site into a documentation server that AI agents query over MCP. Content is extracted at build time and served at runtime.

## Language

**Artifact bundle**:
The complete set of build outputs a documentation server needs to run: documents, manifest, and optionally a search index, skills, and indexer extras.
_Avoid_: build output, mcp files, artifacts (unqualified)

**Document**:
One extracted page of the site: its title, description, markdown, and headings.
_Avoid_: page, doc, ProcessedDoc (in prose)

**Document ID**:
The absolute URL that identifies a document, derived from the site's base URL and the page route. Agents may pass other forms (a trailing slash, a `#fragment`, a `.md` or `.html` suffix, a root-relative path); the server resolves them to the document ID. A fragment selects a section; it is never part of the ID.
_Avoid_: route, key, url (unqualified)

**Manifest**:
The bundle member describing the build that produced it: server name and version, document count, and which indexers ran. Its version is the documentation server's version, not the bundle's format version.
_Avoid_: metadata, build info

**Indexer**:
A build-time step that receives every document and may contribute a search index or indexer extras to the artifact bundle.
_Avoid_: content indexer, provider (for the build side)

**Indexer extras**:
Named bundle members contributed by an indexer that the documentation server carries but does not interpret; only a matching search provider reads them.
_Avoid_: custom artifacts, indexer files

**Search provider**:
A runtime step that ranks documents for a query, reading the search index or indexer extras from the artifact bundle.
_Avoid_: search engine, search backend

**Search ranker**:
The least a search provider must be for the documentation server to use it: a name and a search function (`SearchRanker`). Setup, document lookup, and the document count are optional; the server falls back to the artifact bundle for the last two.
_Avoid_: minimal provider, search function (for the whole object)
