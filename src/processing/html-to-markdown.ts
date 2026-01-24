import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';

/**
 * Convert HTML string to Markdown
 */
export async function htmlToMarkdown(html: string): Promise<string> {
  if (!html || html.trim().length === 0) {
    return '';
  }

  try {
    const processor = unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeRemark)
      .use(remarkGfm)
      .use(remarkStringify, {
        bullet: '-',
        fences: true,
      });

    const result = await processor.process(html);
    let markdown = String(result);

    // Post-process: clean up excessive whitespace
    markdown = cleanMarkdown(markdown);

    return markdown;
  } catch (error) {
    console.error('Error converting HTML to Markdown:', error);
    // Return a basic text extraction as fallback
    return extractTextFallback(html);
  }
}

/**
 * Clean up markdown output
 */
function cleanMarkdown(markdown: string): string {
  return (
    markdown
      // Remove excessive blank lines (more than 2 in a row)
      .replace(/\n{3,}/g, '\n\n')
      // Remove trailing whitespace from lines
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      // Ensure single newline at end
      .trim() + '\n'
  );
}

/**
 * Fallback text extraction when markdown conversion fails
 */
function extractTextFallback(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Convert common HTML elements to text
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
