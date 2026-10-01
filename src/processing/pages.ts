import path from 'node:path';
import fs from 'node:fs/promises';

/** A built HTML page and the route it serves. */
export interface Page {
  /** The URL path, e.g. `/docs/intro` */
  route: string;
  /** Absolute path of the HTML file */
  htmlPath: string;
}

// Directories of static assets, not pages.
const SKIPPED_DIRS = new Set(['assets', 'img', 'static']);
// The generated not-found page.
const NON_ROUTE_HTML = new Set(['404.html']);

/**
 * Find every page in a Docusaurus build directory.
 *
 * Picks up both `path/index.html` (trailingSlash: true/undefined) and sibling
 * `path.html` files (trailingSlash: false). When both exist for the same
 * route, the `index.html` form wins, so sites that emit both for redirect
 * compatibility get a stable choice. Routes matching an `excludeRoutes` glob
 * (`*` and `?`) are dropped.
 */
export async function discoverPages(outDir: string, excludeRoutes: string[]): Promise<Page[]> {
  const excluded = excludeRoutes.map(
    (pattern) => new RegExp(`^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
  );

  const pages = new Map<string, Page>();
  for (const page of await scan(outDir, outDir)) {
    if (excluded.some((regex) => regex.test(page.route))) continue;
    if (!pages.has(page.route) || path.basename(page.htmlPath) === 'index.html') {
      pages.set(page.route, page);
    }
  }
  return Array.from(pages.values());
}

async function scan(outDir: string, dir: string): Promise<Page[]> {
  const pages: Page[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) {
        pages.push(...(await scan(outDir, fullPath)));
      }
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.html') || NON_ROUTE_HTML.has(entry.name)) {
      continue;
    }

    const relativePath = path.relative(outDir, fullPath).replace(/\\/g, '/');
    let route: string;
    if (entry.name === 'index.html') {
      const dirName = path.posix.dirname(relativePath);
      route = dirName === '.' ? '/' : '/' + dirName;
    } else {
      route = '/' + relativePath.slice(0, -'.html'.length);
    }
    pages.push({ route, htmlPath: fullPath });
  }
  return pages;
}
