/**
 * Core type definitions for Azure Terraform MCP Server
 */

import { z } from 'zod';

// ==========================================
// Argument and Documentation Types
// ==========================================

export interface ArgumentDetail {
  name: string;
  description: string;
  required: boolean;
  type: string;
  blockArguments?: ArgumentDetail[];
}

export interface TerraformAzureProviderDocsResult {
  resourceType: string;
  documentationUrl: string;
  summary: string;
  arguments: ArgumentDetail[];
  attributes: Array<{ name: string; description: string }>;
  examples: string[];
  notes: string[];
}

// ==========================================
// AVM Types
// ==========================================

export interface AvmModule {
  moduleName: string;
  description: string;
  source: string;
  repoUrl?: string;
}

export interface AvmVersion {
  tagName: string;
  createdAt: string;
  tarballUrl: string;
}

// ==========================================
// AzAPI Types
// ==========================================

export interface AzApiDocumentationResult {
  resourceType: string;
  apiVersion: string;
  schema?: Record<string, unknown>;
  documentationUrl?: string;
  source: string;
  summary?: string;
  error?: string;
}

// ==========================================
// Installation Help Types
// ==========================================

/**
 * Platform-specific installation command for a tool.
 */
export interface PlatformInstallCommand {
  /** Target platform */
  platform: 'windows' | 'macos' | 'linux';
  /** Package manager or method name (e.g., 'winget', 'brew', 'scoop', 'apt', 'dnf', 'manual') */
  method: string;
  /** The command(s) to execute. For multi-step installs, join with ' && '. If method is 'manual', this is a URL. */
  command: string;
  /** Whether PATH is automatically managed by this method (true for package managers, false for manual) */
  managesPath: boolean;
}

/**
 * Structured installation help for a CLI tool.
 * Designed for consumption by AI agents via MCP — all fields are
 * machine-parseable and the recommended command is pre-resolved
 * to the server's detected platform.
 */
export interface InstallationHelp {
  /** Name of the missing tool */
  toolName: string;
  /** Platform detected by the MCP server (win32 | darwin | linux) */
  detectedPlatform: string;
  /** The single install command recommended for the detected platform */
  recommendedInstallCommand: string;
  /** Command the agent should run after installing to verify success */
  verifyCommand: string;
  /** Install commands for all supported platforms */
  allPlatformCommands: PlatformInstallCommand[];
  /** Official documentation / install guide URL */
  documentationUrl: string;
  /**
   * Instructions for adding the binary to PATH if a manual install was used.
   * Keyed by platform. Only relevant when the install method does NOT manage PATH automatically.
   */
  pathGuidance: Record<string, string>;
  /** Optional extra context (e.g., prerequisites) */
  additionalNotes?: string[];
}

// ==========================================
// aztfexport Types
// ==========================================

export type AztfexportProvider = 'azurerm' | 'azapi';

export interface AztfexportInstallationResult {
  installed: boolean;
  aztfexportVersion?: string;
  terraformVersion?: string;
  status: string;
  error?: string;
  installationHelp?: InstallationHelp;
}

export interface AztfexportCommandResult {
  command: string;
  args: string[];
  description: string;
  outputFolderName?: string;
  workingDirectory?: string;
  notes?: string[];
}

export interface AztfexportResult {
  exitCode: number;
  success: boolean;
  command?: string;
  stdout?: string;
  stderr?: string;
  outputDirectory?: string;
  generatedFiles?: Record<string, string>;
  error?: string;
}

export interface ExportResourceOptions {
  resourceId: string;
  outputFolderName?: string;
  provider?: AztfexportProvider;
  resourceName?: string;
  resourceType?: string;
  dryRun?: boolean;
  includeRoleAssignment?: boolean;
  parallelism?: number;
  continueOnError?: boolean;
}

export interface ExportResourceGroupOptions {
  resourceGroupName: string;
  outputFolderName?: string;
  provider?: AztfexportProvider;
  namePattern?: string;
  typePattern?: string;
  dryRun?: boolean;
  includeRoleAssignment?: boolean;
  parallelism?: number;
  continueOnError?: boolean;
}

export interface ExportQueryOptions {
  query: string;
  outputFolderName?: string;
  provider?: AztfexportProvider;
  namePattern?: string;
  typePattern?: string;
  dryRun?: boolean;
  includeRoleAssignment?: boolean;
  parallelism?: number;
  continueOnError?: boolean;
}

// ==========================================
// Conftest Types
// ==========================================

export interface ConftestInstallationResult {
  installed: boolean;
  version?: string;
  executablePath?: string;
  status: string;
  error?: string;
  installationHelp?: InstallationHelp;
}

export interface PolicyViolation {
  filename: string;
  level: 'failure' | 'warning';
  policy: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ConftestCommandResult {
  command: string;
  args: string[];
  description: string;
  workspaceFolder?: string;
  workingDirectory?: string;
  policySet?: string;
  notes?: string[];
}

export interface ConftestValidationResult {
  success: boolean;
  policySet?: string;
  severityFilter?: string;
  totalViolations?: number;
  violations: PolicyViolation[];
  summary: {
    totalViolations: number;
    failures: number;
    warnings: number;
    policySetUsed?: string;
  };
  workspaceFolder?: string;
  workspacePath?: string;
  terraformFiles?: string[];
  planFile?: string;
  commandOutput?: string;
  commandError?: string;
  error?: string;
}

// ==========================================
// Command Execution Types
// ==========================================

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  command: string;
}

// Re-export configuration types from config module
export type { ServerConfig, AzureConfig, Config } from './config.js';

// ==========================================
// Zod Schemas for Tool Parameters
// ==========================================

export const GetAzureRMDocumentationParams = z.object({
  resourceTypeName: z.string().describe('The name of the AzureRM resource type'),
  docType: z.enum(['resource', 'data-source']).default('resource').describe("Type of documentation: 'resource' or 'data-source'"),
  argumentName: z.string().optional().describe('Specific argument name to retrieve details for'),
  attributeName: z.string().optional().describe('Specific attribute name to retrieve details for'),
});

export const GetAzAPIDocumentationParams = z.object({
  resourceTypeName: z.string().describe('The Azure resource type in Azure REST API format (e.g., Microsoft.Storage/storageAccounts)'),
  apiVersion: z.string().optional().describe('Optional specific API version'),
});

export const ListAvmModulesParams = z.object({});

export const GetAvmLatestVersionParams = z.object({
  moduleName: z.string().describe('The name of the Azure verified module (e.g., avm-res-apimanagement-service)'),
});

export const GetAvmVersionsParams = z.object({
  moduleName: z.string().describe('The name of the Azure verified module'),
});

export const GetAvmDocumentationParams = z.object({
  moduleName: z.string().describe('The name of the Azure verified module'),
  moduleVersion: z.string().describe('The version of the module'),
});

export const CheckAztfexportInstallationParams = z.object({});

export const ExportAzureResourceParams = z.object({
  resourceId: z.string().describe('Azure resource ID to export'),
  outputFolderName: z.string().optional().describe('Output folder name (created under workspace root)'),
  provider: z.enum(['azurerm', 'azapi']).default('azurerm').describe('Terraform provider to use'),
  resourceName: z.string().optional().describe('Custom resource name in Terraform'),
  resourceType: z.string().optional().describe('Custom resource type in Terraform'),
  dryRun: z.boolean().default(false).describe('Perform a dry run without creating files'),
  includeRoleAssignment: z.boolean().default(false).describe('Include role assignments in export'),
  parallelism: z.number().min(1).max(50).default(10).describe('Number of parallel operations'),
  continueOnError: z.boolean().default(true).describe('Continue export even if some resources fail'),
});

export const ExportAzureResourceGroupParams = z.object({
  resourceGroupName: z.string().describe('Name of the resource group to export'),
  outputFolderName: z.string().optional().describe('Output folder name (created under workspace root)'),
  provider: z.enum(['azurerm', 'azapi']).default('azurerm').describe('Terraform provider to use'),
  namePattern: z.string().optional().describe('Pattern for resource naming in Terraform'),
  typePattern: z.string().optional().describe('Pattern for resource type filtering'),
  dryRun: z.boolean().default(false).describe('Perform a dry run without creating files'),
  includeRoleAssignment: z.boolean().default(false).describe('Include role assignments in export'),
  parallelism: z.number().min(1).max(50).default(10).describe('Number of parallel operations'),
  continueOnError: z.boolean().default(true).describe('Continue export even if some resources fail'),
});

export const ExportAzureResourcesByQueryParams = z.object({
  query: z.string().describe('Azure Resource Graph query (WHERE clause)'),
  outputFolderName: z.string().optional().describe('Output folder name (created under workspace root)'),
  provider: z.enum(['azurerm', 'azapi']).default('azurerm').describe('Terraform provider to use'),
  namePattern: z.string().optional().describe('Pattern for resource naming in Terraform'),
  typePattern: z.string().optional().describe('Pattern for resource type filtering'),
  dryRun: z.boolean().default(false).describe('Perform a dry run without creating files'),
  includeRoleAssignment: z.boolean().default(false).describe('Include role assignments in export'),
  parallelism: z.number().min(1).max(50).default(10).describe('Number of parallel operations'),
  continueOnError: z.boolean().default(true).describe('Continue export even if some resources fail'),
});

export const CheckConftestInstallationParams = z.object({});

export const RunConftestWorkspaceValidationParams = z.object({
  workspaceFolder: z.string().describe('Path to the workspace folder to validate'),
  policySet: z.enum(['all', 'Azure-Proactive-Resiliency-Library-v2', 'avmsec']).default('all').describe('Policy set to use'),
  severityFilter: z.enum(['high', 'medium', 'low', 'info']).optional().describe('Severity filter for avmsec policies'),
  customPolicies: z.string().optional().describe('Comma-separated list of custom policy paths'),
});

export const RunConftestWorkspacePlanValidationParams = z.object({
  folderName: z.string().describe('Name of the folder containing the plan file'),
  policySet: z.enum(['all', 'Azure-Proactive-Resiliency-Library-v2', 'avmsec']).default('all').describe('Policy set to use'),
  severityFilter: z.enum(['high', 'medium', 'low', 'info']).optional().describe('Severity filter for avmsec policies'),
  customPolicies: z.string().optional().describe('Comma-separated list of custom policy paths'),
});

export type GetAzureRMDocumentationParamsType = z.infer<typeof GetAzureRMDocumentationParams>;
export type GetAzAPIDocumentationParamsType = z.infer<typeof GetAzAPIDocumentationParams>;
export type ListAvmModulesParamsType = z.infer<typeof ListAvmModulesParams>;
export type GetAvmLatestVersionParamsType = z.infer<typeof GetAvmLatestVersionParams>;
export type GetAvmVersionsParamsType = z.infer<typeof GetAvmVersionsParams>;
export type GetAvmDocumentationParamsType = z.infer<typeof GetAvmDocumentationParams>;
export type CheckAztfexportInstallationParamsType = z.infer<typeof CheckAztfexportInstallationParams>;
export type ExportAzureResourceParamsType = z.infer<typeof ExportAzureResourceParams>;
export type ExportAzureResourceGroupParamsType = z.infer<typeof ExportAzureResourceGroupParams>;
export type ExportAzureResourcesByQueryParamsType = z.infer<typeof ExportAzureResourcesByQueryParams>;
export type CheckConftestInstallationParamsType = z.infer<typeof CheckConftestInstallationParams>;
export type RunConftestWorkspaceValidationParamsType = z.infer<typeof RunConftestWorkspaceValidationParams>;
export type RunConftestWorkspacePlanValidationParamsType = z.infer<typeof RunConftestWorkspacePlanValidationParams>;
