










## v1.0.0 (2026-06-27)

#### :boom: Breaking Change

* [#92](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/92) fix(1.0.0)!: split adapters web/node, add adapter tests, fix docs ([@scalvert](https://github.com/scalvert))
* [#79](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/79) refactor(adapters)!: remove deprecated createCloudflareHandler alias ([@scalvert](https://github.com/scalvert))

#### :rocket: Enhancement

* [#90](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/90) feat: add configurable MCP server URL (server.url / server.urlBase) ([@scalvert](https://github.com/scalvert))

#### :bug: Bug Fix

* [#93](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/93) fix(1.0.0): export missing config types, correct stale docs, add API smoke tests ([@scalvert](https://github.com/scalvert))
* [#80](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/80) fix(agents): move skill into named directory for configure-agents check ([@scalvert](https://github.com/scalvert))

#### :memo: Documentation

* [#94](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/94) [docs] Document resolveServerUrl and build vs runtime config for 1.0.0 ([@scalvert](https://github.com/scalvert))
* [#82](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/82) docs: add 0.13.0 to 1.0.0 migration guide ([@scalvert](https://github.com/scalvert))

#### :house: Internal

* [#89](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/89) refactor(types): WebRequestAdapterConfig extends McpServerDataConfig ([@scalvert](https://github.com/scalvert))
* [#81](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/81) test(theme): add vitest + jsdom coverage for ./theme ([@scalvert](https://github.com/scalvert))

#### Committers: 1
* Steve Calvert ([@scalvert](https://github.com/scalvert))



## v0.13.0 (2026-06-19)

#### :boom: Breaking Change

* [#75](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/75) refactor(adapters)!: consolidate to a single generic web-standard handler ([@scalvert](https://github.com/scalvert))

#### :rocket: Enhancement

* [#78](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/78) feat: configurable FlexSearch and SearchProvider instances ([@mokevnin](https://github.com/mokevnin))
* [#76](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/76) chore(agents): adopt agent baseline + deploy skill ([@scalvert](https://github.com/scalvert))
* [#75](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/75) refactor(adapters)!: consolidate to a single generic web-standard handler ([@scalvert](https://github.com/scalvert))
* [#74](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/74) refactor(adapters): rename createCloudflareHandler to createWebRequestHandler ([@scalvert](https://github.com/scalvert))
* [#63](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/63) feat: support server instructions and custom tool descriptions ([@scalvert](https://github.com/scalvert))

#### :house: Internal

* [#76](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/76) chore(agents): adopt agent baseline + deploy skill ([@scalvert](https://github.com/scalvert))
* [#48](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/48) feat: add markdown-code to manage README code samples ([@scalvert](https://github.com/scalvert))

#### Committers: 3
* George ([@GeorgeTaveras1231](https://github.com/GeorgeTaveras1231))
* Kirill Mokevnin ([@mokevnin](https://github.com/mokevnin))
* Steve Calvert ([@scalvert](https://github.com/scalvert))



## v0.12.0 (2026-04-12)

#### :boom: Breaking Change

* [#20](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/20) refactor: reduce public API surface for 1.0.0 ([@scalvert](https://github.com/scalvert))

#### :bug: Bug Fix

* [#27](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/27) fix: improve adapter correctness and safety ([@scalvert](https://github.com/scalvert))
* [#26](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/26) fix: improve McpDocsServer concurrency, lifecycle, and error handling ([@scalvert](https://github.com/scalvert))

#### :memo: Documentation

* [#28](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/28) docs: complete README documentation for 1.0.0 ([@scalvert](https://github.com/scalvert))

#### :house: Internal

* [#25](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/25) test: add unit tests for McpDocsServer and formatPageContent ([@scalvert](https://github.com/scalvert))
* [#29](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/29) chore: narrow MCP SDK range, add dependabot, coverage thresholds, CONTRIBUTING.md ([@scalvert](https://github.com/scalvert))

#### Committers: 1
* Steve Calvert ([@scalvert](https://github.com/scalvert))



## v0.11.0 (2026-03-17)

#### :rocket: Enhancement

* [#13](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/13) fix: increase default search result limit from 5 to 16 ([@scalvert](https://github.com/scalvert))

#### :bug: Bug Fix

* [#12](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/12) chore: prevent OOM with large doc set ([@bruno-s-freitas](https://github.com/bruno-s-freitas))

#### Committers: 2
* Steve Calvert ([@scalvert](https://github.com/scalvert))
* [@bruno-s-freitas](https://github.com/bruno-s-freitas)



## v0.10.2 (2026-01-30)

#### :bug: Bug Fix
* [#10](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/10) fix: add default export conditions for broader compatibility ([@scalvert](https://github.com/scalvert))

#### Committers: 1
- Steve Calvert ([@scalvert](https://github.com/scalvert))


## v0.10.1 (2026-01-30)

#### :bug: Bug Fix
* [#9](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/9) chore: switch to ESM-only build output ([@scalvert](https://github.com/scalvert))

#### :memo: Documentation
* [#8](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/8) docs: add light and dark mode screenshots for McpInstallButton ([@scalvert](https://github.com/scalvert))

#### Committers: 1
- Steve Calvert ([@scalvert](https://github.com/scalvert))


## v0.10.0 (2026-01-28)

#### :rocket: Enhancement
* [#7](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/7) feat(McpInstallButton): add icon-only mode, configurable header, and Docusaurus styling ([@scalvert](https://github.com/scalvert))

#### :bug: Bug Fix
* [#7](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/7) feat(McpInstallButton): add icon-only mode, configurable header, and Docusaurus styling ([@scalvert](https://github.com/scalvert))

#### Committers: 1
- Steve Calvert ([@scalvert](https://github.com/scalvert))


## v0.9.0 (2026-01-26)

#### :rocket: Enhancement
* [#5](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/5) refactor: codebase cleanup and consistency improvements ([@scalvert](https://github.com/scalvert))

#### :memo: Documentation
* [#5](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/5) refactor: codebase cleanup and consistency improvements ([@scalvert](https://github.com/scalvert))

#### Committers: 1
- Steve Calvert ([@scalvert](https://github.com/scalvert))


## v0.8.0 (2026-01-26)

#### :boom: Breaking Change
* [#3](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/3) refactor: simplify tools to docs_search and docs_fetch ([@scalvert](https://github.com/scalvert))

#### Committers: 1
- Steve Calvert ([@scalvert](https://github.com/scalvert))


## v0.7.0 (2026-01-26)

#### :rocket: Enhancement
* [#2](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/2) feat: add pluggable extraction, indexing, and search architecture ([@scalvert](https://github.com/scalvert))

#### Committers: 1
- Steve Calvert ([@scalvert](https://github.com/scalvert))


## v0.6.0 (2026-01-25)

#### :rocket: Enhancement
* [#1](https://github.com/scalvert/docusaurus-plugin-mcp-server/pull/1) Refactor McpInstallButton to use Docusaurus/Infima styling ([@scalvert](https://github.com/scalvert))

#### Committers: 1
- Steve Calvert ([@scalvert](https://github.com/scalvert))


## v0.5.0 (2026-01-25)


# Changelog
