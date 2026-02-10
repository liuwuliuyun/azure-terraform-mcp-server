/**
 * Azure Terraform MCP Server - Main Library Entry Point
 * 
 * This module exports the public API for the Azure Terraform MCP Server,
 * allowing it to be consumed as a library (e.g., by VS Code extensions).
 */

// Server exports
export { createServer, SERVER_VERSION } from './server.js';

// Tool exports
export {
  getAzureRMProviderDocumentation,
} from './tools/azurerm-docs-provider.js';

export {
  getAzAPIProviderDocumentation,
} from './tools/azapi-docs-provider.js';

export {
  listAvmModules,
  getAvmLatestVersion,
  getAvmVersions,
  getAvmDocumentation,
} from './tools/avm-docs-provider.js';

export {
  checkAztfexportInstallation,
  generateExportAzureResourceCommand_impl,
  generateExportAzureResourceGroupCommand_impl,
  generateExportAzureResourcesByQueryCommand_impl,
} from './tools/aztfexport-runner.js';

export {
  checkConftestInstallation,
  generateConftestWorkspaceValidationCommand_impl,
  generateConftestWorkspacePlanValidationCommand_impl,
} from './tools/conftest-runner.js';

// Type exports
export type {
  ArgumentDetail,
  TerraformAzureProviderDocsResult,
  AvmModule,
  AvmVersion,
  AzApiDocumentationResult,
  AztfexportProvider,
  AztfexportInstallationResult,
  AztfexportCommandResult,
  AztfexportResult,
  ExportResourceOptions,
  ExportResourceGroupOptions,
  ExportQueryOptions,
  ConftestInstallationResult,
  ConftestCommandResult,
  PolicyViolation,
  ConftestValidationResult,
  CommandResult,
  ServerConfig,
  AzureConfig,
  Config,
  InstallationHelp,
  PlatformInstallCommand,
} from './core/types.js';

// Zod schema exports (for runtime validation)
export {
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
} from './core/types.js';

// Config exports
export {
  createConfig,
  getConfig,
  getGitHubToken,
  isDebugMode,
} from './core/config.js';

// Error exports
export {
  ErrorCode,
  McpServerError,
  ToolNotInstalledError,
  CommandExecutionError,
  WorkspaceError,
  ResourceNotFoundError,
  NetworkError,
  PolicyValidationError,
  wrapError,
  getErrorMessage,
} from './core/errors.js';

// Utility exports
export {
  executeCommand,
  isCommandAvailable,
  getCommandVersion,
  getWorkspaceRoot,
  resolveWorkspacePath,
  stripAnsiEscapeSequences,
  findTerraformFiles,
  readJsonFile,
  readDirectoryFiles,
  getAztfexportInstallationHelp,
  getConftestInstallationHelp,
  getTerraformInstallationHelp,
} from './core/utils.js';
