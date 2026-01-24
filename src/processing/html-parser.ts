import fs from 'fs-extra';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import { select } from 'hast-util-select';
import { toString } from 'hast-util-to-string';
import type { Root, Element } from 'hast';
import type { ExtractedContent } from '../types/index.js';

/**
 * Parse HTML string into HAST (HTML AST)
 */
export function parseHtml(html: string): Root {
  const processor = unified().use(rehypeParse);
  return processor.parse(html);
}

/**
 * Parse HTML file into HAST
 */
export async function parseHtmlFile(filePath: string): Promise<Root> {
  const html = await fs.readFile(filePath, 'utf-8');
  return parseHtml(html);
}

/**
 * Extract page title from the HTML document
 *
 * Uses h1 as primary source (most reliable for page title),
 * falls back to <title> tag if no h1 is found.
 */
export function extractTitle(tree: Root): string {
  // Prefer h1 as it's the actual page heading
  const h1Element = select('h1', tree);
  if (h1Element) {
    return toString(h1Element).trim();
  }

  // Fall back to title tag
  const titleElement = select('title', tree);
  if (titleElement) {
    return toString(titleElement).trim();
  }

  return 'Untitled';
}

/**
 * Extract meta description from the HTML document
 */
export function extractDescription(tree: Root): string {
  const metaDescription = select('meta[name="description"]', tree) as Element | null;
  if (metaDescription && metaDescription.properties?.content) {
    return String(metaDescription.properties.content);
  }

  // Try og:description as fallback
  const ogDescription = select('meta[property="og:description"]', tree) as Element | null;
  if (ogDescription && ogDescription.properties?.content) {
    return String(ogDescription.properties.content);
  }

  return '';
}

/**
 * Find the main content element using CSS selectors in priority order
 */
export function findContentElement(tree: Root, selectors: string[]): Element | null {
  for (const selector of selectors) {
    const element = select(selector, tree) as Element | null;
    if (element) {
      // Verify the element has meaningful content
      const text = toString(element).trim();
      if (text.length > 50) {
        return element;
      }
    }
  }

  return null;
}

/**
 * Always-excluded elements that should never appear in content
 */
const ALWAYS_EXCLUDED = ['script', 'style', 'noscript'];

/**
 * Remove unwanted elements from content
 *
 * @param element - The HAST element to clean
 * @param excludeSelectors - CSS selectors for elements to remove (tag names or .class-names)
 */
export function cleanContentElement(element: Element, excludeSelectors: string[]): Element {
  const allSelectors = [...ALWAYS_EXCLUDED, ...excludeSelectors];

  // Deep clone the element to avoid mutating the original
  const cloned = JSON.parse(JSON.stringify(element)) as Element;

  function removeUnwanted(node: Element): void {
    if (!node.children) return;

    node.children = node.children.filter((child) => {
      if (child.type !== 'element') return true;

      const childElement = child as Element;

      // Check if this element matches any unwanted selectors
      for (const selector of allSelectors) {
        if (selector.startsWith('.')) {
          // Class selector
          const className = selector.slice(1);
          const classes = childElement.properties?.className;
          if (Array.isArray(classes) && classes.includes(className)) {
            return false;
          }
          if (typeof classes === 'string' && classes.includes(className)) {
            return false;
          }
        } else if (selector.startsWith('[')) {
          // Attribute selector like [role="navigation"]
          const match = selector.match(/\[([^=]+)="([^"]+)"\]/);
          if (match) {
            const [, attr, value] = match;
            if (attr && childElement.properties?.[attr] === value) {
              return false;
            }
          }
        } else {
          // Tag selector
          if (childElement.tagName === selector) {
            return false;
          }
        }
      }

      // Recursively clean children
      removeUnwanted(childElement);
      return true;
    });
  }

  removeUnwanted(cloned);
  return cloned;
}

/**
 * Options for content extraction
 */
export interface ExtractContentOptions {
  /** CSS selectors for content containers, in priority order */
  contentSelectors: string[];
  /** CSS selectors for elements to exclude from content */
  excludeSelectors: string[];
}

/**
 * Extract content from HTML file
 */
export async function extractContent(
  filePath: string,
  options: ExtractContentOptions
): Promise<ExtractedContent> {
  const tree = await parseHtmlFile(filePath);

  const title = extractTitle(tree);
  const description = extractDescription(tree);

  // Find main content element
  let contentElement = findContentElement(tree, options.contentSelectors);

  if (!contentElement) {
    // Last resort: try to find any element with substantial text
    const body = select('body', tree) as Element | null;
    if (body) {
      contentElement = body;
    }
  }

  let contentHtml = '';
  if (contentElement) {
    const cleanedElement = cleanContentElement(contentElement, options.excludeSelectors);
    // Serialize back to HTML string for markdown conversion
    contentHtml = serializeElement(cleanedElement);
  }

  return {
    title,
    description,
    contentHtml,
  };
}

/**
 * Simple serialization of HAST element to HTML string
 */
function serializeElement(element: Element): string {
  const voidElements = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
  ]);

  function serialize(node: unknown): string {
    if (!node || typeof node !== 'object') return '';

    const n = node as {
      type?: string;
      value?: string;
      tagName?: string;
      properties?: Record<string, unknown>;
      children?: unknown[];
    };

    if (n.type === 'text') {
      return n.value ?? '';
    }

    if (n.type === 'element' && n.tagName) {
      const tagName = n.tagName;
      const props = n.properties ?? {};

      // Build attributes string
      const attrs: string[] = [];
      for (const [key, value] of Object.entries(props)) {
        if (key === 'className' && Array.isArray(value)) {
          attrs.push(`class="${value.join(' ')}"`);
        } else if (typeof value === 'boolean') {
          if (value) attrs.push(key);
        } else if (value !== undefined && value !== null) {
          attrs.push(`${key}="${String(value)}"`);
        }
      }

      const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';

      if (voidElements.has(tagName)) {
        return `<${tagName}${attrStr} />`;
      }

      const children = n.children ?? [];
      const childrenHtml = children.map(serialize).join('');

      return `<${tagName}${attrStr}>${childrenHtml}</${tagName}>`;
    }

    if (n.type === 'root' && n.children) {
      return n.children.map(serialize).join('');
    }

    return '';
  }

  return serialize(element);
}
