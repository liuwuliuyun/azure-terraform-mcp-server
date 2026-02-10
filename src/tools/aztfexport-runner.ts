/**
 * Azure Export for Terraform (aztfexport) utilities for Azure Terraform MCP Server.
 * Generates aztfexport commands for local execution by the agent.
 */

import type {
  AztfexportInstallationResult,
  AztfexportCommandResult,
  CheckAztfexportInstallationParamsType,
  ExportAzureResourceParamsType,
  ExportAzureResourceGroupParamsType,
  ExportAzureResourcesByQueryParamsType,
} from '../core/types.js';
import {
  isCommandAvailable,
  getCommandVersion,
  resolveWorkspacePath,
  AZTFEXPORT_INSTALLATION_HELP,
  TERRAFORM_INSTALLATION_HELP,
} from '../core/utils.js';

// ==========================================
// Public API Functions
// ==========================================

/**
 * Check aztfexport installation and get version information.
 */
export async function checkAztfexportInstallation(
  _params: CheckAztfexportInstallationParamsType
): Promise<AztfexportInstallationResult> {
  try {
    // Check if aztfexport is available
    const aztfexportAvailable = await isCommandAvailable('aztfexport');

    if (!aztfexportAvailable) {
      return {
        installed: false,
        status: 'aztfexport is not installed or not available in PATH',
        installationHelp: AZTFEXPORT_INSTALLATION_HELP,
      };
    }

    // Get aztfexport version
    const aztfexportVersion = await getCommandVersion('aztfexport', '--version');

    // Check terraform
    const terraformAvailable = await isCommandAvailable('terraform');
    let terraformVersion: string | undefined;

    if (terraformAvailable) {
      const tfVersion = await getCommandVersion('terraform', '--version');
      terraformVersion = tfVersion ?? undefined;
    }

    if (!terraformAvailable) {
      return {
        installed: true,
        aztfexportVersion: aztfexportVersion ?? 'Unknown',
        status: 'aztfexport installed but terraform is missing',
        error: 'terraform is not installed. aztfexport requires terraform >= v0.12',
        installationHelp: TERRAFORM_INSTALLATION_HELP,
      };
    }

    return {
      installed: true,
      aztfexportVersion: aztfexportVersion ?? 'Unknown',
      terraformVersion: terraformVersion,
      status: 'Ready to use',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      installed: false,
      status: 'Failed to check installation',
      error: message,
      installationHelp: AZTFEXPORT_INSTALLATION_HELP,
    };
  }
}

// ==========================================
// Command Generators
// ==========================================

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

  const outputDir = outputFolderName ? resolveWorkspacePath(outputFolderName, true) : undefined;

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

  const outputDir = outputFolderName ? resolveWorkspacePath(outputFolderName, true) : undefined;

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

  const outputDir = outputFolderName ? resolveWorkspacePath(outputFolderName, true) : undefined;

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

// ==========================================
// Async Wrappers (for MCP tool handlers)
// ==========================================

/**
 * Generate a command to export a single Azure resource to Terraform configuration.
 */
export async function generateExportAzureResourceCommand_impl(
  params: ExportAzureResourceParamsType
): Promise<AztfexportCommandResult> {
  return generateExportAzureResourceCommand(params);
}

/**
 * Generate a command to export an Azure resource group to Terraform configuration.
 */
export async function generateExportAzureResourceGroupCommand_impl(
  params: ExportAzureResourceGroupParamsType
): Promise<AztfexportCommandResult> {
  return generateExportAzureResourceGroupCommand(params);
}

/**
 * Generate a command to export Azure resources by Azure Resource Graph query.
 */
export async function generateExportAzureResourcesByQueryCommand_impl(
  params: ExportAzureResourcesByQueryParamsType
): Promise<AztfexportCommandResult> {
  return generateExportAzureResourcesByQueryCommand(params);
}

