/**
 * Type-level compatibility: TypeScript written against 2.1 must still compile
 * against 2.2. `npm run typecheck` is the real assertion here; a regression
 * fails it (TS2322, TS2339, TS2312, ...). The runtime tests only keep the
 * fixtures from being optimized away.
 */

import { describe, it, expect } from 'vitest';
import {
  McpDocsServer,
  type McpServerConfig,
  type McpServerDataConfig,
  type McpServerFileConfig,
  type SearchProviderInitData,
} from 'docusaurus-plugin-mcp-server';
import {
  createWebRequestHandler,
  type WebRequestAdapterConfig,
} from 'docusaurus-plugin-mcp-server/adapters';
import {
  createNodeHandler,
  type NodeServerOptions,
} from 'docusaurus-plugin-mcp-server/adapters/node';

// 2.1: `name` is a required string on every config union.
function nameOf(config: McpServerConfig): string {
  return config.name;
}
function adapterName(config: WebRequestAdapterConfig): string {
  return config.name;
}
function nodeName(options: NodeServerOptions): string {
  return options.name;
}

// 2.1: the web adapter config is an interface with the data members.
interface MyWorkerConfig extends WebRequestAdapterConfig {
  region: string;
}

const data: McpServerDataConfig = { name: 'docs', docs: {}, searchIndexData: {} };
const file: McpServerFileConfig = { name: 'docs', docsPath: 'a.json', indexPath: 'b.json' };
const worker: MyWorkerConfig = { ...data, region: 'iad', corsOrigin: '*' };

describe('2.1 types still compile', () => {
  it('keeps the config unions, required names, and the adapter interface', () => {
    const docsOfWorker: WebRequestAdapterConfig['docs'] = worker.docs;
    const legacyInit: SearchProviderInitData = { docsPath: 'a.json', indexPath: 'b.json' };

    expect([nameOf(data), nameOf(file), adapterName(worker), nodeName(file)]).toEqual([
      'docs',
      'docs',
      'docs',
      'docs',
    ]);
    expect(docsOfWorker).toEqual({});
    expect(legacyInit.docsPath).toBe('a.json');
  });

  it('accepts the 2.1 configs where 2.1 did', () => {
    const configs: McpServerConfig[] = [data, file];
    expect(configs.map((c) => new McpDocsServer(c))).toHaveLength(2);
    expect(typeof createWebRequestHandler(worker)).toBe('function');
    const options: NodeServerOptions = { ...file, corsOrigin: false };
    expect(typeof createNodeHandler(options)).toBe('function');
  });
});
