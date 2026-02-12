/**
 * MCP Server implementation for Azure Terraform MCP Server
 * 
 * This module creates and configures the MCP server with all tool registrations.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  GetAzureRMDocumentationParams,
  GetAzAPIDocumentationParams,
  ListAvmModulesParams,
  GetAvmLatestVersionParams,
  GetAvmVersionsParams,
  GetAvmDocumentationParams,
  CheckAztfexportInstallationParams,
  ExportAzureResourceParams,
  ExportAzureResourceGroupParams,
  ExportAzureResourcesByQueryParams,
  CheckConftestInstallationParams,
  RunConftestWorkspaceValidationParams,
  RunConftestWorkspacePlanValidationParams,
  SetupConftestEnvironmentParams,
} from './core/types.js';
import { getErrorMessage } from './core/errors.js';

import {
  getAzureRMProviderDocumentation,
} from './tools/azurerm-docs-provider.js';

import {
  getAzAPIProviderDocumentation,
} from './tools/azapi-docs-provider.js';

import {
  listAvmModules,
  getAvmLatestVersion,
  getAvmVersions,
  getAvmDocumentation,
} from './tools/avm-docs-provider.js';

import {
  checkAztfexportInstallation,
  generateExportAzureResourceCommand_impl,
  generateExportAzureResourceGroupCommand_impl,
  generateExportAzureResourcesByQueryCommand_impl,
} from './tools/aztfexport-runner.js';

import {
  checkConftestInstallation,
  generateConftestWorkspaceValidationCommand_impl,
  generateConftestWorkspacePlanValidationCommand_impl,
  setupConftestEnvironment,
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
    'list_avm_modules',
    'Retrieves all available Azure verified modules. Returns a list of modules with module_name, description, and source fields.',
    ListAvmModulesParams.shape,
    createHandler(listAvmModules)
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
    'get_avm_documentation',
    'Retrieves the documentation (README.md) for a specific Azure verified module version.',
    GetAvmDocumentationParams.shape,
    createHandler(getAvmDocumentation, textResult)
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
    'generate_aztfexport_resource_command',
    'Generate an aztfexport command to export a single Azure resource to Terraform configuration. The command is returned for the agent to execute locally.',
    ExportAzureResourceParams.shape,
    createHandler(generateExportAzureResourceCommand_impl)
  );

  server.tool(
    'generate_aztfexport_resource_group_command',
    'Generate an aztfexport command to export an Azure resource group and all its resources to Terraform configuration. The command is returned for the agent to execute locally.',
    ExportAzureResourceGroupParams.shape,
    createHandler(generateExportAzureResourceGroupCommand_impl)
  );

  server.tool(
    'generate_aztfexport_resources_by_query_command',
    'Generate an aztfexport command to export Azure resources matching an Azure Resource Graph query to Terraform configuration. The command is returned for the agent to execute locally.',
    ExportAzureResourcesByQueryParams.shape,
    createHandler(generateExportAzureResourcesByQueryCommand_impl)
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
    'generate_conftest_workspace_validation_command',
    'Generate a conftest command to validate Terraform files in a workspace folder against Azure security policies. The command is returned for the agent to execute locally.',
    RunConftestWorkspaceValidationParams.shape,
    createHandler(generateConftestWorkspaceValidationCommand_impl)
  );

   server.tool(
     'generate_conftest_workspace_plan_validation_command',
     'Generate a conftest command to validate Terraform plan files against Azure security policies. The command is returned for the agent to execute locally.',
     RunConftestWorkspacePlanValidationParams.shape,
     createHandler(generateConftestWorkspacePlanValidationCommand_impl)
   );

   server.tool(
     'setup_conftest_environment',
     'Automatically setup Conftest environment: checks installation, installs if needed, downloads policies, and validates everything is working.',
     SetupConftestEnvironmentParams.shape,
     createHandler(setupConftestEnvironment)
   );

   return server;
}

export { SERVER_VERSION };
