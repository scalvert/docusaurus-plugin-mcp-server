// The plugin's theme: one MDXComponents that adds the plugin's components to
// the theme's, so MDX pages use them without an import. The built theme, as
// Docusaurus loads it, is checked in docusaurus-load-test.ts; the website build
// (pages with no imports) is the end-to-end check.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import type { LoadContext } from '@docusaurus/types';
import mcpServerPlugin from '../src/plugin/docusaurus-plugin.js';
import * as theme from '../src/theme/index.js';

const context = {
  siteDir: '/site',
  siteConfig: { url: 'https://docs.example.com', baseUrl: '/', title: 'Example' },
} as unknown as LoadContext;

describe('mdxComponents', () => {
  it('is every component a page can use, each the one the theme entry exports', () => {
    expect(Object.keys(theme.mdxComponents).sort()).toEqual([
      'AgentGuide',
      'Check',
      'DoneWhen',
      'ForAgents',
      'ForHumans',
      'McpInstallButton',
      'Prerequisites',
      'Step',
      'Symptom',
    ]);
    for (const [name, component] of Object.entries(theme.mdxComponents)) {
      expect(component).toBe((theme as Record<string, unknown>)[name]);
    }
  });
});

describe('the plugin theme', () => {
  it('is on by default, and its source directory holds only MDXComponents', async () => {
    const themePath = mcpServerPlugin(context, {}).getThemePath?.();
    expect(themePath).toBeDefined();
    const components = (await fs.readdir(themePath!)).filter(
      (file) => /\.(js|jsx|ts|tsx)$/.test(file) && !file.endsWith('.d.ts')
    );
    expect(components).toEqual(['MDXComponents.ts']);
  });

  it('is off with mdxComponents: false', () => {
    expect(mcpServerPlugin(context, { mdxComponents: false }).getThemePath).toBeUndefined();
  });
});
