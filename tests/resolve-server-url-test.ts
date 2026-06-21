import { describe, it, expect } from 'vitest';
import { resolveServerUrl } from '../src/plugin/resolve-server-url.js';

const site = {
  siteUrl: 'https://example.com',
  baseUrl: '/docs/',
  outputDir: 'mcp',
};

describe('resolveServerUrl', () => {
  it('resolves against site origin by default', () => {
    expect(resolveServerUrl({ ...site, server: {} })).toBe('https://example.com/mcp');
  });

  it('resolves against origin when urlBase is origin', () => {
    expect(resolveServerUrl({ ...site, server: { urlBase: 'origin' } })).toBe(
      'https://example.com/mcp'
    );
  });

  it('resolves under baseUrl when urlBase is site', () => {
    expect(resolveServerUrl({ ...site, server: { urlBase: 'site' } })).toBe(
      'https://example.com/docs/mcp'
    );
  });

  it('treats root baseUrl the same as origin for site mode', () => {
    expect(
      resolveServerUrl({
        siteUrl: 'https://example.com',
        baseUrl: '/',
        outputDir: 'mcp',
        server: { urlBase: 'site' },
      })
    ).toBe('https://example.com/mcp');
  });

  it('normalizes trailing slashes on siteUrl', () => {
    expect(
      resolveServerUrl({
        siteUrl: 'https://example.com/',
        baseUrl: '/',
        outputDir: 'mcp',
        server: {},
      })
    ).toBe('https://example.com/mcp');
  });

  it('uses explicit server.url when provided', () => {
    expect(
      resolveServerUrl({
        ...site,
        server: { url: 'https://mcp.example.com/v1' },
      })
    ).toBe('https://mcp.example.com/v1');
  });

  it('explicit server.url wins over urlBase', () => {
    expect(
      resolveServerUrl({
        ...site,
        server: { url: 'https://mcp.example.com/', urlBase: 'site' },
      })
    ).toBe('https://mcp.example.com/');
  });

  it('supports custom outputDir segments', () => {
    expect(
      resolveServerUrl({
        siteUrl: 'https://example.com',
        baseUrl: '/docs/',
        outputDir: 'api/mcp',
        server: { urlBase: 'site' },
      })
    ).toBe('https://example.com/docs/api/mcp');
  });
});
