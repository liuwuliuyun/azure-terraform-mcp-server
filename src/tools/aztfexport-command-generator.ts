/**
 * aztfexport command generator for Azure Terraform MCP Server.
 * Generates aztfexport commands for the agent to execute locally.
 */

import { resolveWorkspacePath } from '../core/utils.js';
import type {
  AztfexportCommandResult,
  ExportAzureResourceParamsType,
  ExportAzureResourceGroupParamsType,
  ExportAzureResourcesByQueryParamsType,
} from '../core/types.js';

/**
 * Generate a command for exporting a single Azure resource to Terraform.
 */
export function generateExportAzureResourceCommand(
  params: ExportAzureResourceParamsType
): AztfexportCommandResult {
  const {
    resourceId,
    outputFolderName,
    provider = 'azurerm',
    resourceName,
    resourceType,
    dryRun = false,
    includeRoleAssignment = false,
    parallelism = 10,
    continueOnError = true,
  } = params;

  const args: string[] = ['resource', '--non-interactive', '--plain-ui'];

  if (provider === 'azapi') {
    args.push('--provider-name', 'azapi');
  }

  if (resourceName) {
    args.push('--name', resourceName);
  }

  if (resourceType) {
    args.push('--type', resourceType);
  }

  if (dryRun) {
    args.push('--dry-run');
  }

  if (includeRoleAssignment) {
    args.push('--include-role-assignment');
  }

  args.push('--parallelism', String(parallelism));

  if (continueOnError) {
    args.push('--continue');
  }

  args.push(resourceId);

  const outputDir = outputFolderName ? resolveWorkspacePath(outputFolderName) : undefined;

  const result: AztfexportCommandResult = {
    command: 'aztfexport',
    args,
    description: `Export Azure resource: ${resourceId}`,
    outputFolderName,
    notes: [
      'This command exports a single Azure resource to Terraform configuration.',
      outputDir ? `Output will be saved to: ${outputDir}` : 'Output will be saved to the current working directory',
      dryRun ? 'This is a dry-run - no files will be created' : 'Terraform files will be generated',
    ],
  };

  if (outputDir) {
    result.workingDirectory = outputDir;
  }

  return result;
}

/**
 * Generate a command for exporting an Azure resource group to Terraform.
 */
export function generateExportAzureResourceGroupCommand(
  params: ExportAzureResourceGroupParamsType
): AztfexportCommandResult {
  const {
    resourceGroupName,
    outputFolderName,
    provider = 'azurerm',
    namePattern,
    typePattern,
    dryRun = false,
    includeRoleAssignment = false,
    parallelism = 10,
    continueOnError = true,
  } = params;

  const args: string[] = ['resource-group', '--non-interactive', '--plain-ui'];

  if (provider === 'azapi') {
    args.push('--provider-name', 'azapi');
  }

  if (namePattern) {
    args.push('--name-pattern', namePattern);
  }

  if (typePattern) {
    args.push('--type-pattern', typePattern);
  }

  if (dryRun) {
    args.push('--dry-run');
  }

  if (includeRoleAssignment) {
    args.push('--include-role-assignment');
  }

  args.push('--parallelism', String(parallelism));

  if (continueOnError) {
    args.push('--continue');
  }

  args.push(resourceGroupName);

  const outputDir = outputFolderName ? resolveWorkspacePath(outputFolderName) : undefined;

  const result: AztfexportCommandResult = {
    command: 'aztfexport',
    args,
    description: `Export Azure resource group: ${resourceGroupName}`,
    outputFolderName,
    notes: [
      'This command exports an entire Azure resource group and all its resources to Terraform configuration.',
      outputDir ? `Output will be saved to: ${outputDir}` : 'Output will be saved to the current working directory',
      dryRun ? 'This is a dry-run - no files will be created' : 'Terraform files will be generated',
      `Using provider: ${provider}`,
    ],
  };

  if (outputDir) {
    result.workingDirectory = outputDir;
  }

  return result;
}

/**
 * Generate a command for exporting Azure resources by Azure Resource Graph query.
 */
export function generateExportAzureResourcesByQueryCommand(
  params: ExportAzureResourcesByQueryParamsType
): AztfexportCommandResult {
  const {
    query,
    outputFolderName,
    provider = 'azurerm',
    namePattern,
    typePattern,
    dryRun = false,
    includeRoleAssignment = false,
    parallelism = 10,
    continueOnError = true,
  } = params;

  const args: string[] = ['query', '--non-interactive', '--plain-ui'];

  if (provider === 'azapi') {
    args.push('--provider-name', 'azapi');
  }

  if (namePattern) {
    args.push('--name-pattern', namePattern);
  }

  if (typePattern) {
    args.push('--type-pattern', typePattern);
  }

  if (dryRun) {
    args.push('--dry-run');
  }

  if (includeRoleAssignment) {
    args.push('--include-role-assignment');
  }

  args.push('--parallelism', String(parallelism));

  if (continueOnError) {
    args.push('--continue');
  }

  args.push(query);

  const outputDir = outputFolderName ? resolveWorkspacePath(outputFolderName) : undefined;

  const result: AztfexportCommandResult = {
    command: 'aztfexport',
    args,
    description: `Export Azure resources by query: ${query.substring(0, 50)}${query.length > 50 ? '...' : ''}`,
    outputFolderName,
    notes: [
      'This command exports Azure resources matching the given Azure Resource Graph query to Terraform configuration.',
      outputDir ? `Output will be saved to: ${outputDir}` : 'Output will be saved to the current working directory',
      dryRun ? 'This is a dry-run - no files will be created' : 'Terraform files will be generated',
      `Query: ${query}`,
      `Using provider: ${provider}`,
    ],
  };

  if (outputDir) {
    result.workingDirectory = outputDir;
  }

  return result;
}
