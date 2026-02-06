#!/usr/bin/env node
/**
 * CLI entry point for Azure Terraform MCP Server
 * 
 * This module starts the MCP server with stdio transport for use with
 * MCP-compatible clients like VS Code, Claude Desktop, etc.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  const shutdown = async () => {
    try {
      await server.close();
    } catch {
      // Ignore errors during shutdown
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start the server
  try {
    await server.connect(transport);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
