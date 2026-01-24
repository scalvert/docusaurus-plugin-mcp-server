import { describe, it, expect } from 'vitest';
import { generateAdapterFiles } from '../src/adapters/generator.js';

describe('generateAdapterFiles', () => {
  describe('Vercel adapter', () => {
    it('generates correct files for Vercel', () => {
      const files = generateAdapterFiles({
        platform: 'vercel',
        name: 'my-docs',
        baseUrl: 'https://docs.example.com',
      });

      expect(files).toHaveLength(2);

      const apiFile = files.find((f) => f.path === 'api/mcp.js');
      expect(apiFile).toBeDefined();
      expect(apiFile?.content).toContain('createVercelHandler');
      expect(apiFile?.content).toContain("name: 'my-docs'");
      expect(apiFile?.content).toContain("baseUrl: 'https://docs.example.com'");

      const configFile = files.find((f) => f.path === 'vercel.json');
      expect(configFile).toBeDefined();
      expect(configFile?.content).toContain('includeFiles');
      expect(configFile?.content).toContain('build/mcp/**');
    });
  });

  describe('Netlify adapter', () => {
    it('generates correct files for Netlify', () => {
      const files = generateAdapterFiles({
        platform: 'netlify',
        name: 'my-docs',
        baseUrl: 'https://docs.example.com',
      });

      expect(files).toHaveLength(2);

      const functionFile = files.find((f) => f.path === 'netlify/functions/mcp.js');
      expect(functionFile).toBeDefined();
      expect(functionFile?.content).toContain('createNetlifyHandler');
      expect(functionFile?.content).toContain("name: 'my-docs'");

      const configFile = files.find((f) => f.path === 'netlify.toml');
      expect(configFile).toBeDefined();
      expect(configFile?.content).toContain('included_files');
      expect(configFile?.content).toContain('/mcp');
    });
  });

  describe('Cloudflare adapter', () => {
    it('generates correct files for Cloudflare', () => {
      const files = generateAdapterFiles({
        platform: 'cloudflare',
        name: 'my-docs',
        baseUrl: 'https://docs.example.com',
      });

      expect(files).toHaveLength(2);

      const workerFile = files.find((f) => f.path === 'workers/mcp.js');
      expect(workerFile).toBeDefined();
      expect(workerFile?.content).toContain('createCloudflareHandler');
      expect(workerFile?.content).toContain("name: 'my-docs'");

      const configFile = files.find((f) => f.path === 'wrangler.toml');
      expect(configFile).toBeDefined();
      expect(configFile?.content).toContain('my-docs-mcp');
    });
  });

  it('throws error for unknown platform', () => {
    expect(() =>
      generateAdapterFiles({
        platform: 'unknown' as any,
        name: 'test',
        baseUrl: 'https://example.com',
      })
    ).toThrow('Unknown platform');
  });
});
