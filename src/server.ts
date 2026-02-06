/**
 * MCP Server implementation for Azure Terraform MCP Server
 * 
 * This module creates and configures the MCP server with all tool registrations.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  GetAzureRMDocumentationParams,
  GetAzAPIDocumentationParams,
  GetAvmModulesParams,
  GetAvmLatestVersionParams,
  GetAvmVersionsParams,
  GetAvmVariablesParams,
  GetAvmOutputsParams,
  CheckAztfexportInstallationParams,
  ExportAzureResourceParams,
  ExportAzureResourceGroupParams,
  ExportAzureResourcesByQueryParams,
  CheckConftestInstallationParams,
  RunConftestWorkspaceValidationParams,
  RunConftestWorkspacePlanValidationParams,
} from './core/types.js';
import { getErrorMessage } from './core/errors.js';

import {
  getAzureRMProviderDocumentation,
} from './tools/azurerm-docs-provider.js';

import {
  getAzAPIProviderDocumentation,
} from './tools/azapi-docs-provider.js';

import {
  getAvmModules,
  getAvmLatestVersion,
  getAvmVersions,
  getAvmVariables,
  getAvmOutputs,
} from './tools/avm-docs-provider.js';

import {
  checkAztfexportInstallation,
  exportAzureResource,
  exportAzureResourceGroup,
  exportAzureResourcesByQuery,
} from './tools/aztfexport-runner.js';

import {
  checkConftestInstallation,
  runConftestWorkspaceValidation,
  runConftestWorkspacePlanValidation,
} from './tools/conftest-runner.js';

/**
 * Server version
 */
const SERVER_VERSION = '0.1.0';

/**
 * Tool result content type
 */
type ToolContent = { type: 'text'; text: string };

/**
 * Tool result structure - compatible with MCP SDK
 */
interface ToolResult {
  [key: string]: unknown;
  content: ToolContent[];
  isError?: boolean;
}

/**
 * Create a successful tool result with JSON content.
 */
function successResult(data: unknown): ToolResult {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Create a successful tool result with string content.
 */
function textResult(text: string): ToolResult {
  return {
    content: [{ type: 'text' as const, text }],
  };
}

/**
 * Create an error tool result.
 */
function errorResult(error: unknown): ToolResult {
  return {
    content: [{ type: 'text' as const, text: `Error: ${getErrorMessage(error)}` }],
    isError: true,
  };
}

/**
 * Create a tool handler with error handling.
 */
function createHandler<TParams, TResult>(
  handler: (params: TParams) => Promise<TResult>,
  formatResult: (result: TResult) => ToolResult = successResult
): (params: TParams) => Promise<ToolResult> {
  return async (params: TParams) => {
    try {
      const result = await handler(params);
      return formatResult(result);
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * Create and configure the MCP server with all tools registered.
 * 
 * @returns Configured MCP server instance
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: 'Azure Terraform MCP Server',
    version: SERVER_VERSION,
  });

  // ==========================================
  // DOCUMENTATION TOOLS
  // ==========================================

  server.tool(
    'get_avm_modules',
    'Retrieves all available Azure verified modules. Returns a list of modules with module_name, description, and source fields.',
    GetAvmModulesParams.shape,
    createHandler(getAvmModules)
  );

  server.tool(
    'get_avm_latest_version',
    'Retrieves the latest version of a specified Azure verified module.',
    GetAvmLatestVersionParams.shape,
    createHandler(getAvmLatestVersion)
  );

  server.tool(
    'get_avm_versions',
    'Retrieves all available versions of a specified Azure verified module.',
    GetAvmVersionsParams.shape,
    createHandler(getAvmVersions)
  );

  server.tool(
    'get_avm_variables',
    'Retrieves the input variables schema for a specific Azure verified module version.',
    GetAvmVariablesParams.shape,
    createHandler(getAvmVariables, textResult)
  );

  server.tool(
    'get_avm_outputs',
    'Retrieves the output definitions for a specific Azure verified module version.',
    GetAvmOutputsParams.shape,
    createHandler(getAvmOutputs, textResult)
  );

  server.tool(
    'get_azurerm_provider_documentation',
    'Retrieve documentation for a specific AzureRM resource type in Terraform. Supports optional argument/attribute lookup.',
    GetAzureRMDocumentationParams.shape,
    createHandler(getAzureRMProviderDocumentation)
  );

  server.tool(
    'get_azapi_provider_documentation',
    'Retrieve documentation for a specific AzAPI resource type in Terraform. Use Azure REST API format (e.g., Microsoft.Storage/storageAccounts).',
    GetAzAPIDocumentationParams.shape,
    createHandler(getAzAPIProviderDocumentation)
  );

  // ==========================================
  // AZTFEXPORT TOOLS
  // ==========================================

  server.tool(
    'check_aztfexport_installation',
    'Check if Azure Export for Terraform (aztfexport) is installed and get version information.',
    CheckAztfexportInstallationParams.shape,
    createHandler(checkAztfexportInstallation)
  );

  server.tool(
    'export_azure_resource',
    'Export a single Azure resource to Terraform configuration using aztfexport.',
    ExportAzureResourceParams.shape,
    createHandler(exportAzureResource)
  );

  server.tool(
    'export_azure_resource_group',
    'Export an Azure resource group and all its resources to Terraform configuration using aztfexport.',
    ExportAzureResourceGroupParams.shape,
    createHandler(exportAzureResourceGroup)
  );

  server.tool(
    'export_azure_resources_by_query',
    'Export Azure resources matching an Azure Resource Graph query to Terraform configuration.',
    ExportAzureResourcesByQueryParams.shape,
    createHandler(exportAzureResourcesByQuery)
  );

  // ==========================================
  // CONFTEST TOOLS
  // ==========================================

  server.tool(
    'check_conftest_installation',
    'Check if Conftest is installed and get version information.',
    CheckConftestInstallationParams.shape,
    createHandler(checkConftestInstallation)
  );

  server.tool(
    'run_conftest_workspace_validation',
    'Validate Terraform files in a workspace folder against Azure security policies using Conftest.',
    RunConftestWorkspaceValidationParams.shape,
    createHandler(runConftestWorkspaceValidation)
  );

  server.tool(
    'run_conftest_workspace_plan_validation',
    'Validate Terraform plan files against Azure security policies using Conftest.',
    RunConftestWorkspacePlanValidationParams.shape,
    createHandler(runConftestWorkspacePlanValidation)
  );

  return server;
}

export { SERVER_VERSION };
