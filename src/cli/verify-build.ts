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
import { ARTIFACT_FILES, type ArtifactBundle } from '../artifacts/bundle.js';
import { readArtifactBundle } from '../artifacts/node.js';
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
 * Verify the MCP build output: the artifact bundle reads and validates, and
 * has what the built-in local search needs.
 */
export async function verifyBuild(options: VerifyOptions): Promise<VerifyResult> {
  const result: VerifyResult = {
    success: true,
    docsFound: 0,
    errors: [],
    warnings: [],
  };
  const fail = (message: string) => {
    result.errors.push(message);
    result.success = false;
    return result;
  };

  const mcpDir = mcpDirFor(options);

  if (!(await fs.pathExists(mcpDir))) {
    fail(`MCP directory not found: ${mcpDir}`);
    result.errors.push('Did you run "npm run build" with the MCP plugin configured?');
    result.errors.push(
      'If you set the plugin\'s "outputDir" option, pass the same value with --output-dir.'
    );
    return result;
  }

  let bundle: ArtifactBundle;
  try {
    bundle = await readArtifactBundle(mcpDir);
  } catch (error) {
    return fail((error as Error).message);
  }

  if (!(await fs.pathExists(path.join(mcpDir, ARTIFACT_FILES.bundle)))) {
    result.warnings.push(
      `${ARTIFACT_FILES.bundle} not found: this build predates docusaurus-plugin-mcp-server 2.2. ` +
        'Rebuild to get it; the per-file layout stops working in 3.0.'
    );
  }

  result.docsFound = Object.keys(bundle.docs).length;
  if (result.docsFound === 0) {
    result.warnings.push('The artifact bundle contains no documents');
  }

  if (!bundle.searchIndex) {
    fail(
      "The artifact bundle has no search index, which the built-in local search needs. Keep the 'local' " +
        "indexer in the plugin's indexers (the default)."
    );
  }

  return result;
}

/**
 * Start an MCP server over the build output and check that it loads content.
 */
export async function testServer(options: VerifyOptions): Promise<ServerTestResult> {
  try {
    const server = new McpDocsServer({ artifacts: await readArtifactBundle(mcpDirFor(options)) });

    await server.initialize();
    const status = await server.getStatus();

    if (!status.initialized) {
      return { success: false, message: 'Server failed to initialize' };
    }

    if (status.docCount === 0) {
      return { success: false, message: 'Server has no documents loaded' };
    }

    const skillsNote = status.skillCount > 0 ? ` and ${status.skillCount} skill(s)` : '';
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
