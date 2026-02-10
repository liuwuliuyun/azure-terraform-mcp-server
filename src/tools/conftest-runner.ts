/**
 * Conftest runner for Azure Verified Modules (AVM) policy validation.
 * Generates conftest commands for local execution by the agent.
 */

import type {
  ConftestInstallationResult,
  ConftestCommandResult,
  CheckConftestInstallationParamsType,
  RunConftestWorkspaceValidationParamsType,
  RunConftestWorkspacePlanValidationParamsType,
} from '../core/types.js';
import {
  isCommandAvailable,
  getCommandVersion,
  CONFTEST_INSTALLATION_HELP,
} from '../core/utils.js';
import {
  generateConftestWorkspaceValidationCommand,
  generateConftestWorkspacePlanValidationCommand,
} from './conftest-command-generator.js';

// ==========================================
// Public API Functions
// ==========================================

/**
 * Check if Conftest is installed and get version information.
 */
export async function checkConftestInstallation(
  _params: CheckConftestInstallationParamsType
): Promise<ConftestInstallationResult> {
  try {
    const installed = await isCommandAvailable('conftest');

    if (!installed) {
      return {
        installed: false,
        status: 'Conftest is not installed or not available in PATH',
        installationHelp: CONFTEST_INSTALLATION_HELP,
      };
    }

    const version = await getCommandVersion('conftest', '--version');

    return {
      installed: true,
      version: version ?? 'Unknown',
      executablePath: 'conftest',
      status: 'Conftest is installed and ready to use',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      installed: false,
      status: 'Failed to check installation',
      error: message,
      installationHelp: CONFTEST_INSTALLATION_HELP,
    };
  }
}

/**
 * Generate a conftest command to validate Terraform files in a workspace folder.
 */
export async function generateConftestWorkspaceValidationCommand_impl(
  params: RunConftestWorkspaceValidationParamsType
): Promise<ConftestCommandResult> {
  return generateConftestWorkspaceValidationCommand(params);
}

/**
 * Generate a conftest command to validate a Terraform plan file.
 */
export async function generateConftestWorkspacePlanValidationCommand_impl(
  params: RunConftestWorkspacePlanValidationParamsType
): Promise<ConftestCommandResult> {
  return generateConftestWorkspacePlanValidationCommand(params);
}

