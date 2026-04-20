import type { ContentIndexer, ProviderContext, ProcessedDoc } from 'docusaurus-plugin-mcp-server';

export default class AlgoliaIndexer implements ContentIndexer {
  readonly name = 'algolia';

  shouldRun(): boolean {
    return process.env.ALGOLIA_SYNC === 'true';
  }

  async initialize(context: ProviderContext): Promise<void> {
    console.log(`[Algolia] Initializing for ${context.baseUrl}`);
  }

  async indexDocuments(docs: ProcessedDoc[]): Promise<void> {
    // Push docs to Algolia
  }

  async finalize(): Promise<Map<string, unknown>> {
    // No local artifacts needed
    return new Map();
  }
}
