/**
 * AzAPI provider documentation tools for Azure Terraform MCP Server.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AzApiDocumentationResult,
  GetAzAPIDocumentationParamsType,
} from '../core/types.js';

// ==========================================
// Schema Loading
// ==========================================

let cachedSchema: Record<string, unknown> | null = null;

/**
 * Get the path to the AzAPI schema file.
 * This looks for the schema file in the data directory.
 */
function getSchemaPath(): string | null {
  // Try to find the schema file in common locations
  const possiblePaths = [
    // Relative to cwd
    join(process.cwd(), 'data', 'azapi_schemas_v2.6.1.json'),
    // Relative to the original Python project structure
    join(process.cwd(), 'src', 'data', 'azapi_schemas_v2.6.1.json'),
    // Look for bundled data folder
    join(process.cwd(), 'node_modules', '@azure', 'terraform-mcp-server', 'data', 'azapi_schemas_v2.6.1.json'),
  ];

  for (const schemaPath of possiblePaths) {
    if (existsSync(schemaPath)) {
      return schemaPath;
    }
  }

  return null;
}

/**
 * Load the AzAPI schema from disk.
 */
function loadSchema(): Record<string, unknown> {
  if (cachedSchema) {
    return cachedSchema;
  }

  const schemaPath = getSchemaPath();
  if (!schemaPath) {
    return {};
  }

  try {
    const content = readFileSync(schemaPath, 'utf-8');
    cachedSchema = JSON.parse(content) as Record<string, unknown>;
    return cachedSchema;
  } catch {
    return {};
  }
}

/**
 * Clear the cached schema (useful for testing).
 */
export function clearSchemaCache(): void {
  cachedSchema = null;
}

// ==========================================
// Main Provider Function
// ==========================================

/**
 * Search Azure API provider documentation and schemas.
 */
export async function getAzAPIProviderDocumentation(
  params: GetAzAPIDocumentationParamsType
): Promise<AzApiDocumentationResult> {
  const { resourceTypeName, apiVersion } = params;

  try {
    // Search in loaded schema
    const schemaInfo = searchAzAPISchema(resourceTypeName, apiVersion);

    if (schemaInfo) {
      return {
        resourceType: resourceTypeName,
        apiVersion: apiVersion ?? 'latest',
        schema: schemaInfo,
        source: 'azapi_schemas.json',
      };
    }

    // If not found in local schema, try to fetch from Azure docs
    return await fetchAzAPIDocsOnline(resourceTypeName, apiVersion);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      resourceType: resourceTypeName,
      apiVersion: apiVersion ?? 'latest',
      error: `Error searching AzAPI documentation: ${errorMessage}`,
      source: 'error',
    };
  }
}

// ==========================================
// Schema Search
// ==========================================

/**
 * Search in the loaded AzAPI schema.
 */
function searchAzAPISchema(
  resourceType: string,
  _apiVersion?: string
): Record<string, unknown> | null {
  const schema = loadSchema();

  if (Object.keys(schema).length === 0) {
    return null;
  }

  // Normalize the resource type for searching
  const searchType = resourceType.toLowerCase();

  // Search through the schema
  for (const [key, value] of Object.entries(schema)) {
    if (key.toLowerCase().includes(searchType)) {
      return {
        definition: value,
        schemaKey: key,
      };
    }
  }

  return null;
}

// ==========================================
// Online Documentation Fetch
// ==========================================

/**
 * Fetch AzAPI documentation from online sources.
 */
async function fetchAzAPIDocsOnline(
  resourceType: string,
  apiVersion?: string
): Promise<AzApiDocumentationResult> {
  try {
    // Try Azure REST API documentation
    const azureDocsUrl = `https://docs.microsoft.com/en-us/rest/api/${resourceType.toLowerCase()}`;

    const response = await fetch(azureDocsUrl, {
      method: 'HEAD', // Just check if the URL exists
      headers: {
        'User-Agent': 'Azure-Terraform-MCP-Server',
      },
    });

    if (response.ok) {
      return {
        resourceType: resourceType,
        apiVersion: apiVersion ?? 'latest',
        documentationUrl: azureDocsUrl,
        source: 'Azure REST API docs',
        summary: `Azure REST API documentation for ${resourceType}`,
      };
    }
  } catch {
    // Continue to fallback
  }

  // Fallback response
  return {
    resourceType: resourceType,
    apiVersion: apiVersion ?? 'latest',
    summary: `AzAPI resource type: ${resourceType}`,
    documentationUrl: 'https://registry.terraform.io/providers/Azure/azapi/latest/docs',
    source: 'fallback',
  };
}
