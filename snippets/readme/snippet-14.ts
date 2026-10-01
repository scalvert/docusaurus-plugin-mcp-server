import type {
  SearchRanker,
  ProviderContext,
  SearchOptions,
  SearchResult,
} from 'docusaurus-plugin-mcp-server';

export default class GleanSearchProvider implements SearchRanker {
  readonly name = 'glean';

  private apiEndpoint = process.env.GLEAN_API_ENDPOINT;
  private apiToken = process.env.GLEAN_API_TOKEN;

  // Optional. Rejecting fails the server's initialization.
  async initialize(context: ProviderContext): Promise<void> {
    if (!this.apiEndpoint || !this.apiToken) {
      throw new Error('GLEAN_API_ENDPOINT and GLEAN_API_TOKEN required');
    }
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    // Call Glean Search API and transform results
    return [];
  }
}
