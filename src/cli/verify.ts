#!/usr/bin/env node
/**
 * MCP Verification CLI
 *
 * Verifies that the MCP build output is valid and the server works correctly.
 *
 * Usage:
 *   npx docusaurus-mcp-verify [buildDir]
 *
 * Options:
 *   buildDir  Path to Docusaurus build output (default: ./build)
 */

import fs from 'fs-extra';
import path from 'path';
import { McpDocsServer } from '../mcp/server.js';

interface VerifyResult {
  success: boolean;
  docsFound: number;
  errors: string[];
  warnings: string[];
}

/**
 * Verify the MCP build output
 */
async function verifyBuild(buildDir: string): Promise<VerifyResult> {
  const result: VerifyResult = {
    success: true,
    docsFound: 0,
    errors: [],
    warnings: [],
  };

  const mcpDir = path.join(buildDir, 'mcp');

  // Check if MCP directory exists
  if (!(await fs.pathExists(mcpDir))) {
    result.errors.push(`MCP directory not found: ${mcpDir}`);
    result.errors.push('Did you run "npm run build" with the MCP plugin configured?');
    result.success = false;
    return result;
  }

  // Check required files
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
    const docsPath = path.join(mcpDir, 'docs.json');
    const docs = await fs.readJson(docsPath);

    if (typeof docs !== 'object' || docs === null) {
      result.errors.push('docs.json is not a valid object');
      result.success = false;
    } else {
      result.docsFound = Object.keys(docs).length;

      if (result.docsFound === 0) {
        result.warnings.push('docs.json contains no documents');
      }

      // Validate document structure
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
    const indexPath = path.join(mcpDir, 'search-index.json');
    const indexData = await fs.readJson(indexPath);

    if (typeof indexData !== 'object' || indexData === null) {
      result.errors.push('search-index.json is not a valid object');
      result.success = false;
    }
  } catch (error) {
    result.errors.push(`Failed to parse search-index.json: ${(error as Error).message}`);
    result.success = false;
  }

  // Validate manifest.json
  try {
    const manifestPath = path.join(mcpDir, 'manifest.json');
    const manifest = await fs.readJson(manifestPath);

    if (!manifest.name || typeof manifest.name !== 'string') {
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
 * Test the MCP server with the build output
 */
async function testServer(buildDir: string): Promise<{ success: boolean; message: string }> {
  const mcpDir = path.join(buildDir, 'mcp');
  const docsPath = path.join(mcpDir, 'docs.json');
  const indexPath = path.join(mcpDir, 'search-index.json');
  const manifestPath = path.join(mcpDir, 'manifest.json');

  try {
    const manifest = await fs.readJson(manifestPath);
    const docs = await fs.readJson(docsPath);
    const searchIndexData = await fs.readJson(indexPath);

    const server = new McpDocsServer({
      name: manifest.name || 'test-docs',
      version: manifest.version || '1.0.0',
      docs,
      searchIndexData,
    });

    await server.initialize();
    const status = await server.getStatus();

    if (!status.initialized) {
      return { success: false, message: 'Server failed to initialize' };
    }

    if (status.docCount === 0) {
      return { success: false, message: 'Server has no documents loaded' };
    }

    return {
      success: true,
      message: `Server initialized with ${status.docCount} documents`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Server test failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const buildDir = args[0] || './build';

  console.log('');
  console.log('🔍 MCP Build Verification');
  console.log('='.repeat(50));
  console.log(`Build directory: ${path.resolve(buildDir)}`);
  console.log('');

  // Verify build output
  console.log('📁 Checking build output...');
  const verifyResult = await verifyBuild(buildDir);

  if (verifyResult.errors.length > 0) {
    console.log('');
    console.log('❌ Errors:');
    for (const error of verifyResult.errors) {
      console.log(`   • ${error}`);
    }
  }

  if (verifyResult.warnings.length > 0) {
    console.log('');
    console.log('⚠️  Warnings:');
    for (const warning of verifyResult.warnings) {
      console.log(`   • ${warning}`);
    }
  }

  if (!verifyResult.success) {
    console.log('');
    console.log('❌ Build verification failed');
    process.exit(1);
  }

  console.log(`   ✓ Found ${verifyResult.docsFound} documents`);
  console.log('   ✓ All required files present');
  console.log('   ✓ File structure valid');

  // Test server
  console.log('');
  console.log('🚀 Testing MCP server...');
  const serverResult = await testServer(buildDir);

  if (!serverResult.success) {
    console.log(`   ❌ ${serverResult.message}`);
    console.log('');
    console.log('❌ Server test failed');
    process.exit(1);
  }

  console.log(`   ✓ ${serverResult.message}`);

  console.log('');
  console.log('✅ All checks passed!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Deploy your site to a hosting provider');
  console.log('  2. Configure MCP endpoint (see README for platform guides)');
  console.log('  3. Connect your AI tools to the MCP server');
  console.log('');

  process.exit(0);
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
