/**
 * Example: Glean Search Provider
 *
 * This file demonstrates how to create a custom SearchProvider for Glean.
 * Place this in your Docusaurus project and reference it in your config:
 *
 * ```js
 * // docusaurus.config.js
 * plugins: [
 *   ['docusaurus-plugin-mcp-server', {
 *     indexers: false, // Glean indexes via their Python SDK separately
 *     search: './src/providers/glean-search-provider.js',
 *   }],
 * ]
 * ```
 *
 * Required environment variables:
 * - GLEAN_API_TOKEN: Your Glean API token (Client API token, not Indexing token)
 * - GLEAN_INSTANCE: Your Glean instance name (e.g., 'mycompany' for mycompany-be.glean.com)
 */

import { Glean } from '@gleanwork/api-client';
import type {
  SearchProvider,
  ProviderContext,
  SearchProviderInitData,
  SearchOptions,
  SearchResult,
  ProcessedDoc,
} from 'docusaurus-plugin-mcp-server';

/**
 * Type definitions for Glean API (from @gleanwork/api-client)
 * These are duplicated here for clarity; in practice you can use the SDK's types.
 */
interface GleanSearchRequest {
  query: string;
  pageSize?: number;
  maxSnippetSize?: number;
  cursor?: string;
  timeoutMillis?: number;
}

interface GleanSearchResponse {
  results?: GleanSearchResult[];
  trackingToken?: string;
  hasMoreResults?: boolean;
  cursor?: string;
}

interface GleanSearchResult {
  url: string;
  title?: string;
  document?: {
    title?: string;
    metadata?: Record<string, unknown>;
  };
  snippets?: Array<{
    text?: string;
    snippet: string;
  }>;
  fullText?: string;
}

export default class GleanSearchProvider implements SearchProvider {
  readonly name = 'glean';

  private client: Glean | null = null;
  private baseUrl: string = '';
  private ready = false;

  async initialize(context: ProviderContext, _initData?: SearchProviderInitData): Promise<void> {
    const apiToken = process.env.GLEAN_API_TOKEN;
    const instance = process.env.GLEAN_INSTANCE;

    if (!apiToken) {
      throw new Error('[Glean] GLEAN_API_TOKEN environment variable is required');
    }

    if (!instance) {
      throw new Error('[Glean] GLEAN_INSTANCE environment variable is required');
    }

    this.client = new Glean({
      apiToken,
      instance,
    });

    this.baseUrl = context.baseUrl;
    this.ready = true;

    console.log(`[Glean] Initialized search provider for instance: ${instance}`);
  }

  isReady(): boolean {
    return this.ready && this.client !== null;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    if (!this.client) {
      throw new Error('[Glean] Provider not initialized');
    }

    const pageSize = options?.limit ?? 5;

    try {
      const request: GleanSearchRequest = {
        query,
        pageSize,
        maxSnippetSize: 200,
      };

      const response = (await this.client.client.search.query(request)) as GleanSearchResponse;

      return this.transformResults(response.results ?? []);
    } catch (error) {
      console.error('[Glean] Search error:', error);
      throw error;
    }
  }

  /**
   * Get a document by route.
   *
   * Note: Glean doesn't provide a direct "get document by URL" API,
   * so we search for the exact URL. For better performance, consider
   * caching results or using a hybrid approach with local docs.
   */
  async getDocument(route: string): Promise<ProcessedDoc | null> {
    if (!this.client) {
      throw new Error('[Glean] Provider not initialized');
    }

    try {
      // Build the full URL to search for
      const fullUrl = `${this.baseUrl.replace(/\/$/, '')}${route}`;

      // Search for documents with this exact URL using Glean's URL operator
      const request: GleanSearchRequest = {
        query: `url:${fullUrl}`,
        pageSize: 1,
      };

      const response = (await this.client.client.search.query(request)) as GleanSearchResponse;

      const result = response.results?.[0];
      if (!result) {
        return null;
      }

      // Extract snippet text
      const snippetText = result.snippets?.[0]?.text ?? result.snippets?.[0]?.snippet ?? '';

      // Transform to ProcessedDoc format
      // Note: Glean may not have all fields, so we provide defaults
      return {
        route,
        title: result.title ?? result.document?.title ?? 'Untitled',
        description: (result.document?.metadata?.description as string) ?? '',
        markdown: result.fullText ?? snippetText,
        headings: [], // Glean doesn't provide heading structure
      };
    } catch (error) {
      console.error('[Glean] Get document error:', error);
      return null;
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    if (!this.client) {
      return { healthy: false, message: 'Glean client not initialized' };
    }

    try {
      // Perform a simple search to verify connectivity
      const request: GleanSearchRequest = {
        query: 'test',
        pageSize: 1,
      };

      await this.client.client.search.query(request);

      return {
        healthy: true,
        message: `Connected to Glean instance: ${process.env.GLEAN_INSTANCE}`,
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Glean health check failed: ${String(error)}`,
      };
    }
  }

  /**
   * Transform Glean search results to the plugin's SearchResult format
   */
  private transformResults(gleanResults: GleanSearchResult[]): SearchResult[] {
    return gleanResults.map((result, index) => {
      // Extract route from URL
      let route = '/';
      try {
        const url = new URL(result.url);
        route = url.pathname;
      } catch {
        // If URL parsing fails, use the raw URL as route
        route = result.url.startsWith('/') ? result.url : `/${result.url}`;
      }

      // Get the best available snippet text
      const snippet = result.snippets?.[0]?.text ?? result.snippets?.[0]?.snippet ?? '';

      return {
        route,
        title: result.title ?? result.document?.title ?? 'Untitled',
        // Use position-based scoring since Glean doesn't expose relevance scores
        score: 1 - index * 0.1,
        snippet,
        matchingHeadings: [],
      };
    });
  }
}
