import path from 'path';
import fs from 'fs-extra';
import type { RouteConfig } from '@docusaurus/types';
import type { FlattenedRoute } from '../types/index.js';

/**
 * Flatten nested Docusaurus routes into a simple array
 */
export function flattenRoutes(routes: RouteConfig[]): FlattenedRoute[] {
  const flattened: FlattenedRoute[] = [];

  function traverse(route: RouteConfig): void {
    // Add the route if it has a path
    if (route.path) {
      flattened.push({
        path: route.path,
        htmlPath: '', // Will be resolved later
      });
    }

    // Recursively process child routes
    if (route.routes && Array.isArray(route.routes)) {
      for (const childRoute of route.routes) {
        traverse(childRoute);
      }
    }
  }

  for (const route of routes) {
    traverse(route);
  }

  return flattened;
}

/**
 * Convert a URL path to the corresponding HTML file path in the build directory
 *
 * Examples:
 * - /guides/chat/overview -> build/guides/chat/overview/index.html
 * - / -> build/index.html
 * - /api -> build/api/index.html
 */
export function routeToHtmlPath(routePath: string, outDir: string): string {
  // Normalize the route path
  let normalizedPath = routePath;

  // Remove trailing slash if present (except for root)
  if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
    normalizedPath = normalizedPath.slice(0, -1);
  }

  // Handle root path
  if (normalizedPath === '/') {
    return path.join(outDir, 'index.html');
  }

  // For all other paths, append /index.html
  return path.join(outDir, normalizedPath, 'index.html');
}

/**
 * Filter out routes that should not be processed
 */
export function filterRoutes(
  routes: FlattenedRoute[],
  excludePatterns: string[]
): FlattenedRoute[] {
  return routes.filter((route) => {
    return !excludePatterns.some((pattern) => {
      // Convert glob pattern to regex
      const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(route.path);
    });
  });
}

/**
 * Discover all HTML files in the build directory and create routes for them.
 * This is more reliable than using Docusaurus routes as it captures all built pages.
 */
export async function discoverHtmlFiles(outDir: string): Promise<FlattenedRoute[]> {
  const routes: FlattenedRoute[] = [];

  async function scanDirectory(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip common non-content directories
        if (['assets', 'img', 'static'].includes(entry.name)) {
          continue;
        }
        await scanDirectory(fullPath);
      } else if (entry.name === 'index.html') {
        // Convert file path back to route
        const relativePath = path.relative(outDir, fullPath);
        let routePath = '/' + path.dirname(relativePath).replace(/\\/g, '/');

        // Handle root index.html
        if (routePath === '/.') {
          routePath = '/';
        }

        routes.push({
          path: routePath,
          htmlPath: fullPath,
        });
      }
    }
  }

  await scanDirectory(outDir);
  return routes;
}

/**
 * Resolve HTML paths for flattened routes, filtering out those that don't exist
 */
export async function resolveHtmlPaths(
  routes: FlattenedRoute[],
  outDir: string
): Promise<FlattenedRoute[]> {
  const resolved: FlattenedRoute[] = [];

  for (const route of routes) {
    const htmlPath = routeToHtmlPath(route.path, outDir);

    if (await fs.pathExists(htmlPath)) {
      resolved.push({
        ...route,
        htmlPath,
      });
    }
  }

  return resolved;
}

/**
 * Get all processable routes from the build directory
 */
export async function collectRoutes(
  outDir: string,
  excludePatterns: string[]
): Promise<FlattenedRoute[]> {
  // Discover all HTML files in the build directory
  const allRoutes = await discoverHtmlFiles(outDir);

  // Filter out excluded routes
  const filteredRoutes = filterRoutes(allRoutes, excludePatterns);

  // Deduplicate routes by path
  const uniqueRoutes = new Map<string, FlattenedRoute>();
  for (const route of filteredRoutes) {
    if (!uniqueRoutes.has(route.path)) {
      uniqueRoutes.set(route.path, route);
    }
  }

  return Array.from(uniqueRoutes.values());
}
