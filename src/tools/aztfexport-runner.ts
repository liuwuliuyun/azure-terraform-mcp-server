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
  AZTFEXPORT_INSTALLATION_HELP,
  TERRAFORM_INSTALLATION_HELP,
} from '../core/utils.js';
import {
  generateExportAzureResourceCommand,
  generateExportAzureResourceGroupCommand,
  generateExportAzureResourcesByQueryCommand,
} from './aztfexport-command-generator.js';

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

