/**
 * AzAPI provider documentation tools for Azure Terraform MCP Server.
 */

import type {
  AzApiDocumentationResult,
  GetAzAPIDocumentationParamsType,
} from '../core/types.js';
import {
  initializeAzAPISchemas,
  getAzAPISchema,
  clearAzAPISchemaCache,
} from './azapi-schema-generator.js';
import { getExamplesForResourceType, clearExamplesCache } from './azapi-examples-provider.js';
// ==========================================
// Schema Loading (Lazy)
// ==========================================

let cachedSchemas: Record<string, string> | null = null;

/**
 * Get schemas, loading them lazily if needed.
 * Uses the schema generator with 5-day cache expiry.
 */
async function getSchemas(): Promise<Record<string, string>> {
  if (cachedSchemas) {
    return cachedSchemas;
  }

  cachedSchemas = await initializeAzAPISchemas();
  return cachedSchemas;
}

/**
 * Clear the cached schema (useful for testing).
 */
export function clearSchemaCache(): void {
  cachedSchemas = null;
  clearAzAPISchemaCache();
  clearExamplesCache();
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
    // Load schemas lazily (will be cached after first load)
    const schemas = await getSchemas();

    // Search in loaded schema
    const schemaDoc = searchAzAPISchema(resourceTypeName, schemas);

    if (schemaDoc) {
      // Fetch examples for this resource type
      const examples = await getExamplesForResourceType(resourceTypeName);

      return {
        resourceType: resourceTypeName,
        apiVersion: apiVersion ?? 'latest',
        schema: {
          documentation: schemaDoc,
        },
        source: 'azapi_provider_schemas',
        summary: `AzAPI resource schema for ${resourceTypeName}`,
        examples: examples.length > 0 ? examples : undefined,
      };
    }

    // If not found in local schema, return a helpful error
    return {
      resourceType: resourceTypeName,
      apiVersion: apiVersion ?? 'latest',
      summary: `Resource type ${resourceTypeName} not found in AzAPI schemas`,
      documentationUrl:
        'https://registry.terraform.io/providers/Azure/azapi/latest/docs',
      source: 'not_found',
      error: `No schema found for resource type: ${resourceTypeName}. Available resource types can be found in the AzAPI provider documentation.`,
    };
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
  schemas: Record<string, string>
): string | null {
  if (Object.keys(schemas).length === 0) {
    return null;
  }

  // Try exact match first using the helper function
  const exactMatch = getAzAPISchema(resourceType, schemas);
  if (exactMatch) {
    return exactMatch;
  }

  // Normalize the resource type for searching
  const searchType = resourceType.toLowerCase();

  // Search through the schema for partial matches
  for (const [key, value] of Object.entries(schemas)) {
    if (key.toLowerCase().includes(searchType)) {
      return value;
    }
  }

  // Try matching just the resource name part (e.g., "clusters" from "Microsoft.Kusto/clusters")
  const resourceParts = searchType.split('/');
  if (resourceParts.length >= 2) {
    const provider = resourceParts[0]; // e.g., "microsoft.kusto"
    const resourceName = resourceParts.slice(1).join('/'); // e.g., "clusters"

    for (const [key, value] of Object.entries(schemas)) {
      const keyLower = key.toLowerCase();
      if (keyLower.startsWith(provider ?? '') && keyLower.includes(resourceName)) {
        return value;
      }
    }
  }

  return null;
}
