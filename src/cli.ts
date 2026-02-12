#!/usr/bin/env node
/**
 * CLI entry point for Azure Terraform MCP Server
 * 
 * This module starts the MCP server with stdio transport for use with
 * MCP-compatible clients like VS Code, Claude Desktop, etc.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { getConfig } from './core/config.js';
import { initTelemetry, shutdownTelemetry, trackUserActivity } from './core/telemetry.js';

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Initialize telemetry first
  const config = getConfig();
  await initTelemetry(config.telemetry);

  // Track server startup
  trackUserActivity();

  const server = createServer();
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  const shutdown = async () => {
    try {
      await server.close();
    } catch {
      // Ignore errors during shutdown
    }

    // Shutdown telemetry
    await shutdownTelemetry();

    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start the server
  try {
    await server.connect(transport);
  } catch (error) {
    console.error('Failed to start server:', error);
    await shutdownTelemetry();
    process.exit(1);
  }
}

main();

