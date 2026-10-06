#!/usr/bin/env node
/**
 * MCP Verification CLI
 *
 * Verifies that the MCP build output is valid and the server works correctly.
 *
 * Usage:
 *   npx docusaurus-mcp-verify [buildDir] [--output-dir <dir>]
 *
 * Options:
 *   buildDir      Path to Docusaurus build output (default: ./build)
 *   --output-dir  MCP artifact directory inside buildDir (default: mcp)
 */

import path from 'path';
import { parseVerifyArgs, testServer, verifyBuild, VERIFY_USAGE } from './verify-build.js';

async function main(): Promise<void> {
  let args;
  try {
    args = parseVerifyArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    console.error('');
    console.error(VERIFY_USAGE);
    process.exit(2);
  }

  if (args.help) {
    console.log(VERIFY_USAGE);
    process.exit(0);
  }

  const { buildDir, outputDir } = args;

  console.log('');
  console.log('🔍 MCP Build Verification');
  console.log('='.repeat(50));
  console.log(`Build directory: ${path.resolve(buildDir)}`);
  console.log(`MCP directory:   ${path.resolve(path.join(buildDir, outputDir))}`);
  console.log('');

  // Verify build output
  console.log('📁 Checking build output...');
  const verifyResult = await verifyBuild({ buildDir, outputDir });

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
  console.log('   ✓ Artifact bundle is valid');

  // Test server
  console.log('');
  console.log('🚀 Testing MCP server...');
  const serverResult = await testServer({ buildDir, outputDir });

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
  console.log('  1. Deploy your site and serve the MCP endpoint at /mcp. Platform guides:');
  console.log('     https://docusaurus-plugin-mcp-server.vercel.app/docs/deploy');
  console.log('  2. Connect your AI tools to the MCP server');
  console.log('');

  process.exit(0);
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
