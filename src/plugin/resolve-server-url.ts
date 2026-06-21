export type ServerUrlBase = 'origin' | 'site';

export interface ResolveServerUrlInput {
  siteUrl: string;
  baseUrl: string;
  outputDir: string;
  server: {
    url?: string;
    urlBase?: ServerUrlBase;
  };
}

/**
 * Resolve the public MCP endpoint URL for the install button and globalData.
 *
 * - `server.url` — use an explicit endpoint when MCP is hosted elsewhere.
 * - `server.urlBase: 'origin'` (default) — `{siteUrl}/{outputDir}`.
 * - `server.urlBase: 'site'` — under the Docusaurus base path, e.g. `{siteUrl}{baseUrl}{outputDir}`.
 */
export function resolveServerUrl(input: ResolveServerUrlInput): string {
  const { siteUrl, baseUrl, outputDir, server } = input;

  if (server.url) {
    return new URL(server.url).href;
  }

  const urlBase = server.urlBase ?? 'origin';
  const resolveAgainst = urlBase === 'site' ? new URL(baseUrl, siteUrl) : new URL(siteUrl);

  return new URL(outputDir, resolveAgainst).href;
}
