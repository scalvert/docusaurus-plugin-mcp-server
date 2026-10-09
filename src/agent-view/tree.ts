/**
 * The agent view of a page: what agents get from it. Content marked for
 * agents (`ForAgents`) is kept, even though it is `hidden` from people;
 * content marked for people (`ForHumans`) is left out.
 *
 * Applied once per page, to the content tree, before anything reads it: the
 * document's Markdown and headings, and so the search index, all come from
 * the agent view. Build-time only (hast); the runtime gets the result.
 */

import type { Element } from 'hast';
import { AUDIENCE_PROPERTY, type Audience } from './audience.js';

function audienceOf(node: Element): Audience | undefined {
  const value = node.properties?.[AUDIENCE_PROPERTY];
  return value === 'agents' || value === 'humans' ? value : undefined;
}

/**
 * A copy of `content` without the elements marked for people, and their
 * subtrees. The content element itself is never removed, even if marked.
 */
export function toAgentView(content: Element): Element {
  const copy = (node: Element): Element => ({
    ...node,
    properties: { ...node.properties },
    children: node.children
      .filter((child) => child.type !== 'element' || audienceOf(child) !== 'humans')
      .map((child) => (child.type === 'element' ? copy(child) : { ...child })),
  });
  return copy(content);
}
