/**
 * Document structure for FlexSearch indexing
 */
export interface IndexableDocument {
  /** Unique identifier (route path) */
  id: string;
  /** Document title */
  title: string;
  /** Full content for search */
  content: string;
  /** Concatenated heading text for search */
  headings: string;
  /** Meta description */
  description: string;
}
