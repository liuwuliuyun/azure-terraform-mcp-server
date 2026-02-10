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
  resolveWorkspacePath,
  getConftestInstallationHelp,
} from '../core/utils.js';

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
        status: 'Conftest is not installed or not available in PATH. Install it using the recommended command below, then run the verify command to confirm.',
        installationHelp: getConftestInstallationHelp(),
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
      status: 'Failed to check installation. Install conftest using the recommended command below, then run the verify command to confirm.',
      error: message,
      installationHelp: getConftestInstallationHelp(),
    };
  }
}

// ==========================================
// Command Generators
// ==========================================

/**
 * Generate a conftest command for validating Terraform files in a workspace.
 */
export function generateConftestWorkspaceValidationCommand(
  params: RunConftestWorkspaceValidationParamsType
): ConftestCommandResult {
  const { workspaceFolder, policySet = 'all', severityFilter, customPolicies } = params;

  const workspacePath = resolveWorkspacePath(workspaceFolder.trim(), true);
  const args: string[] = ['test', '--all-namespaces'];

  // Add default policy paths based on policy set
  const policyPaths: Record<string, string> = {
    all: './policy',
    'Azure-Proactive-Resiliency-Library-v2': './policy/Azure-Proactive-Resiliency-Library-v2',
    avmsec: './policy/avmsec',
  };

  const policyPath = policyPaths[policySet] || './policy';
  args.push('-p', policyPath);

  // Add severity exception for avmsec if specified
  if (policySet === 'avmsec' && severityFilter) {
    const severityFile = `.conftest_severity_${severityFilter}.rego`;
    args.push('-p', severityFile);
  }

  // Add custom policies
  if (customPolicies) {
    const customPolicyPaths = customPolicies.split(',').map((p) => p.trim());
    for (const cp of customPolicyPaths) {
      if (cp) {
        args.push('-p', cp);
      }
    }
  }

  // Output format
  args.push('--output', 'json', '.');

  const notes: string[] = [
    'This command validates Terraform files in the workspace against Azure security policies.',
    `Workspace folder: ${workspacePath}`,
    `Policy set: ${policySet}`,
  ];

  if (severityFilter) {
    notes.push(`Severity filter: ${severityFilter}`);
  }

  if (customPolicies) {
    notes.push(`Custom policies: ${customPolicies}`);
  }

  notes.push('');
  notes.push('Steps to run this command:');
  notes.push('1. Ensure conftest is installed: https://www.conftest.dev/');
  notes.push('2. Download the Azure policy library (see below)');
  notes.push('3. If using avmsec with severity filter, create the severity exception file');
  notes.push('4. Run: conftest ' + args.join(' '));
  notes.push('');
  notes.push('=== How to download the Azure policy library ===');
  notes.push('');
  notes.push('Clone the policy repository into the workspace:');
  notes.push('  cd ' + workspacePath);
  notes.push('  git clone https://github.com/Azure/policy-library-avm.git policy');
  notes.push('');
  notes.push('To update an existing policy library:');
  notes.push('  cd ' + workspacePath + '/policy && git pull');
  notes.push('');
  notes.push('After cloning, the policy directory will contain the following policy sets:');
  notes.push('  - policy/                                          → All policies (use policySet "all")');
  notes.push('  - policy/Azure-Proactive-Resiliency-Library-v2/    → Azure resiliency policies (use policySet "Azure-Proactive-Resiliency-Library-v2")');
  notes.push('  - policy/avmsec/                                   → AVM security policies (use policySet "avmsec")');
  notes.push('');
  notes.push('Repository URL: https://github.com/Azure/policy-library-avm');

  return {
    command: 'conftest',
    args,
    description: `Validate Terraform workspace: ${workspaceFolder}`,
    workspaceFolder,
    workingDirectory: workspacePath,
    policySet,
    notes,
  };
}

/**
 * Generate a conftest command for validating a Terraform plan file.
 */
export function generateConftestWorkspacePlanValidationCommand(
  params: RunConftestWorkspacePlanValidationParamsType
): ConftestCommandResult {
  const { folderName, policySet = 'all', severityFilter, customPolicies } = params;

  const workspacePath = resolveWorkspacePath(folderName.trim(), true);
  const args: string[] = ['test', '--all-namespaces'];

  // Add default policy paths based on policy set
  const policyPaths: Record<string, string> = {
    all: './policy',
    'Azure-Proactive-Resiliency-Library-v2': './policy/Azure-Proactive-Resiliency-Library-v2',
    avmsec: './policy/avmsec',
  };

  const policyPath = policyPaths[policySet] || './policy';
  args.push('-p', policyPath);

  // Add severity exception for avmsec if specified
  if (policySet === 'avmsec' && severityFilter) {
    const severityFile = `.conftest_severity_${severityFilter}.rego`;
    args.push('-p', severityFile);
  }

  // Add custom policies
  if (customPolicies) {
    const customPolicyPaths = customPolicies.split(',').map((p) => p.trim());
    for (const cp of customPolicyPaths) {
      if (cp) {
        args.push('-p', cp);
      }
    }
  }

  // Output format and plan file
  args.push('--output', 'json', 'tfplan.json');

  const notes: string[] = [
    'This command validates a Terraform plan file against Azure security policies.',
    `Folder: ${workspacePath}`,
    `Policy set: ${policySet}`,
    '',
    'Prerequisites:',
    '- Ensure tfplan.json exists in the folder (convert from binary if needed):',
    '  terraform show -json tfplan.binary > tfplan.json',
    '- Ensure conftest is installed: https://www.conftest.dev/',
    '- Ensure the policy repository is cloned to ./policy directory',
  ];

  if (severityFilter) {
    notes.push(`Severity filter: ${severityFilter}`);
  }

  if (customPolicies) {
    notes.push(`Custom policies: ${customPolicies}`);
  }

  notes.push('');
  notes.push('Steps to run this command:');
  notes.push('1. Navigate to the folder: cd ' + workspacePath);
  notes.push('2. Convert plan file if needed: terraform show -json tfplan.binary > tfplan.json');
  notes.push('3. Download the Azure policy library (see below)');
  notes.push('4. Run: conftest ' + args.join(' '));
  notes.push('');
  notes.push('=== How to download the Azure policy library ===');
  notes.push('');
  notes.push('Clone the policy repository into the workspace:');
  notes.push('  cd ' + workspacePath);
  notes.push('  git clone https://github.com/Azure/policy-library-avm.git policy');
  notes.push('');
  notes.push('To update an existing policy library:');
  notes.push('  cd ' + workspacePath + '/policy && git pull');
  notes.push('');
  notes.push('After cloning, the policy directory will contain the following policy sets:');
  notes.push('  - policy/                                          → All policies (use policySet "all")');
  notes.push('  - policy/Azure-Proactive-Resiliency-Library-v2/    → Azure resiliency policies (use policySet "Azure-Proactive-Resiliency-Library-v2")');
  notes.push('  - policy/avmsec/                                   → AVM security policies (use policySet "avmsec")');
  notes.push('');
  notes.push('Repository URL: https://github.com/Azure/policy-library-avm');

  return {
    command: 'conftest',
    args,
    description: `Validate Terraform plan: ${folderName}`,
    workspaceFolder: folderName,
    workingDirectory: workspacePath,
    policySet,
    notes,
  };
}

// ==========================================
// Async Wrappers (for MCP tool handlers)
// ==========================================

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

