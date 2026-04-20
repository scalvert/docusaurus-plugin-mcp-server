import type {
  SearchProvider,
  ProviderContext,
  SearchOptions,
  SearchResult,
} from 'docusaurus-plugin-mcp-server';

export default class GleanSearchProvider implements SearchProvider {
  readonly name = 'glean';

  private apiEndpoint = process.env.GLEAN_API_ENDPOINT!;
  private apiToken = process.env.GLEAN_API_TOKEN!;

  async initialize(context: ProviderContext): Promise<void> {
    if (!this.apiEndpoint || !this.apiToken) {
      throw new Error('GLEAN_API_ENDPOINT and GLEAN_API_TOKEN required');
    }
  }

  isReady(): boolean {
    return !!this.apiEndpoint && !!this.apiToken;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    // Call Glean Search API and transform results
    return [];
  }
}
