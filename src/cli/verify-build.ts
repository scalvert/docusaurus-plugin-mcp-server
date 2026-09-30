/**
 * Build verification behind the `docusaurus-mcp-verify` CLI.
 *
 * Kept separate from the CLI entry so it can be tested without the entry's
 * `process.exit` side effects.
 */

import fs from 'fs-extra';
import path from 'path';
import { parseArgs } from 'util';
import { McpDocsServer } from '../mcp/server.js';
import { DEFAULT_PLUGIN_OPTIONS } from '../types/index.js';

export interface VerifyOptions {
  /** Docusaurus build output directory */
  buildDir: string;
  /** MCP artifact directory inside `buildDir`; matches the plugin's `outputDir` option */
  outputDir?: string;
}

export interface VerifyResult {
  success: boolean;
  docsFound: number;
  errors: string[];
  warnings: string[];
}

export interface ServerTestResult {
  success: boolean;
  message: string;
}

export const VERIFY_USAGE = `Usage: docusaurus-mcp-verify [buildDir] [--output-dir <dir>]

  buildDir            Docusaurus build output (default: ./build)
  --output-dir <dir>  MCP artifact directory inside buildDir, matching the
                      plugin's outputDir option (default: ${DEFAULT_PLUGIN_OPTIONS.outputDir})
  -h, --help          Show this help`;

export type ParsedVerifyArgs = { help: true } | ({ help: false } & Required<VerifyOptions>);

/**
 * Parse CLI arguments. Throws on unknown flags or extra positionals.
 */
export function parseVerifyArgs(argv: string[]): ParsedVerifyArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      'output-dir': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    return { help: true };
  }
  if (positionals.length > 1) {
    throw new Error(`Expected at most one build directory, got: ${positionals.join(', ')}`);
  }

  return {
    help: false,
    buildDir: positionals[0] ?? './build',
    outputDir: values['output-dir'] ?? DEFAULT_PLUGIN_OPTIONS.outputDir,
  };
}

function mcpDirFor({ buildDir, outputDir = DEFAULT_PLUGIN_OPTIONS.outputDir }: VerifyOptions) {
  return path.join(buildDir, outputDir);
}

/**
 * Verify the MCP build output
 */
export async function verifyBuild(options: VerifyOptions): Promise<VerifyResult> {
  const result: VerifyResult = {
    success: true,
    docsFound: 0,
    errors: [],
    warnings: [],
  };

  const mcpDir = mcpDirFor(options);

  if (!(await fs.pathExists(mcpDir))) {
    result.errors.push(`MCP directory not found: ${mcpDir}`);
    result.errors.push('Did you run "npm run build" with the MCP plugin configured?');
    result.errors.push(
      'If you set the plugin\'s "outputDir" option, pass the same value with --output-dir.'
    );
    result.success = false;
    return result;
  }

  const requiredFiles = ['docs.json', 'search-index.json', 'manifest.json'];

  for (const file of requiredFiles) {
    const filePath = path.join(mcpDir, file);
    if (!(await fs.pathExists(filePath))) {
      result.errors.push(`Required file missing: ${filePath}`);
      result.success = false;
    }
  }

  if (!result.success) {
    return result;
  }

  // Validate docs.json
  try {
    const docs = await fs.readJson(path.join(mcpDir, 'docs.json'));

    if (typeof docs !== 'object' || docs === null) {
      result.errors.push('docs.json is not a valid object');
      result.success = false;
    } else {
      result.docsFound = Object.keys(docs).length;

      if (result.docsFound === 0) {
        result.warnings.push('docs.json contains no documents');
      }

      for (const [route, doc] of Object.entries(docs)) {
        const d = doc as Record<string, unknown>;
        if (!d.title || typeof d.title !== 'string') {
          result.warnings.push(`Document ${route} is missing a title`);
        }
        if (!d.markdown || typeof d.markdown !== 'string') {
          result.warnings.push(`Document ${route} is missing markdown content`);
        }
      }
    }
  } catch (error) {
    result.errors.push(`Failed to parse docs.json: ${(error as Error).message}`);
    result.success = false;
  }

  // Validate search-index.json
  try {
    const indexData = await fs.readJson(path.join(mcpDir, 'search-index.json'));

    if (typeof indexData !== 'object' || indexData === null) {
      result.errors.push('search-index.json is not a valid object');
      result.success = false;
    }
  } catch (error) {
    result.errors.push(`Failed to parse search-index.json: ${(error as Error).message}`);
    result.success = false;
  }

  // Validate manifest.json (field names match McpManifest)
  try {
    const manifest = await fs.readJson(path.join(mcpDir, 'manifest.json'));

    if (!manifest.serverName || typeof manifest.serverName !== 'string') {
      result.warnings.push('manifest.json is missing server name');
    }
    if (!manifest.version || typeof manifest.version !== 'string') {
      result.warnings.push('manifest.json is missing server version');
    }
  } catch (error) {
    result.errors.push(`Failed to parse manifest.json: ${(error as Error).message}`);
    result.success = false;
  }

  return result;
}

/**
 * Start an MCP server over the build output and check that it loads content.
 */
export async function testServer(options: VerifyOptions): Promise<ServerTestResult> {
  const mcpDir = mcpDirFor(options);

  try {
    const manifest = await fs.readJson(path.join(mcpDir, 'manifest.json'));
    const docs = await fs.readJson(path.join(mcpDir, 'docs.json'));
    const searchIndexData = await fs.readJson(path.join(mcpDir, 'search-index.json'));
    const skillsPath = path.join(mcpDir, 'skills.json');
    const skills = (await fs.pathExists(skillsPath)) ? await fs.readJson(skillsPath) : undefined;

    const server = new McpDocsServer({
      name: manifest.serverName || 'test-docs',
      version: manifest.version || '1.0.0',
      ...(manifest.baseUrl ? { baseUrl: manifest.baseUrl } : {}),
      docs,
      searchIndexData,
      skills,
    });

    await server.initialize();
    const status = await server.getStatus();

    if (!status.initialized) {
      return { success: false, message: 'Server failed to initialize' };
    }

    if (status.docCount === 0) {
      return { success: false, message: 'Server has no documents loaded' };
    }

    const skillsNote = skills ? ` and ${status.skillCount} skill(s)` : '';
    return {
      success: true,
      message: `Server "${status.name}" initialized with ${status.docCount} documents${skillsNote}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Server test failed: ${(error as Error).message}`,
    };
  }
}
