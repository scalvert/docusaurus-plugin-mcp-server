/**
 * The audience contract: how a page marks content for agents or for people.
 * The theme components (`ForAgents`, `ForHumans`) write it and page
 * extraction reads it, so both import the names from here.
 *
 * Edge-safe and React-free.
 */

/** The attribute that marks an element's content for one audience. */
export const AUDIENCE_ATTRIBUTE = 'data-mcp-audience';

/** Who an element's content is for. */
export type Audience = 'agents' | 'humans';

/**
 * The attribute's hast property name, as HTML parsing produces it
 * (`data-mcp-audience` → `dataMcpAudience`).
 */
export const AUDIENCE_PROPERTY = 'dataMcpAudience';
