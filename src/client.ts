/**
 * In-Process MCP Client Factory
 *
 * Provides a convenience API for VS Code extensions and other TypeScript consumers
 * to create an MCP client connected to the Azure Terraform MCP Server entirely
 * in-process (no child process, no stdio).
 *
 * Usage:
 * ```ts
 * import { createInProcessClient } from 'azure-terraform-mcp-server/client';
 *
 * const client = await createInProcessClient();
 * const tools  = await client.listTools();
 * const result = await client.callTool({
 *   name: 'get_azurerm_provider_documentation',
 *   arguments: { resourceType: 'azurerm_resource_group', resourceCategory: 'resources' },
 * });
 * // When done:
 * await client.close();
 * ```
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './server.js';

/**
 * Options for creating an in-process MCP client.
 */
export interface InProcessClientOptions {
  /** Name of the consuming client (shows up in MCP negotiation). Default: "azure-terraform-mcp-client" */
  clientName?: string;
  /** Version of the consuming client. Default: "1.0.0" */
  clientVersion?: string;
}

/**
 * Extended MCP Client that also exposes server lifecycle helpers.
 */
export interface InProcessClient {
  /** The underlying MCP Client – use this for `listTools()`, `callTool()`, etc. */
  client: Client;
  /** Gracefully close both the client and the in-process server. */
  close: () => Promise<void>;
}

/**
 * Create an MCP client connected to an in-process Azure Terraform MCP Server.
 *
 * This avoids spawning a child process and communicates over an in-memory
 * transport, making it ideal for VS Code extensions that want to bundle
 * the server as a library dependency.
 *
 * @param options - Optional client configuration
 * @returns An `InProcessClient` with the connected client and a `close()` helper.
 */
export async function createInProcessClient(
  options?: InProcessClientOptions,
): Promise<InProcessClient> {
  const server = createServer();

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client(
    {
      name: options?.clientName ?? 'azure-terraform-mcp-client',
      version: options?.clientVersion ?? '1.0.0',
    },
    { capabilities: {} },
  );

  // Connect both ends – order does not matter for in-memory transport.
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);

  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
