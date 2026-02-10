/**
 * Conftest command generator for Azure Terraform MCP Server.
 * Generates conftest commands for the agent to execute locally.
 */

import { resolveWorkspacePath } from '../core/utils.js';
import type {
  ConftestCommandResult,
  RunConftestWorkspaceValidationParamsType,
  RunConftestWorkspacePlanValidationParamsType,
} from '../core/types.js';

/**
 * Generate a conftest command for validating Terraform files in a workspace.
 */
export function generateConftestWorkspaceValidationCommand(
  params: RunConftestWorkspaceValidationParamsType
): ConftestCommandResult {
  const { workspaceFolder, policySet = 'all', severityFilter, customPolicies } = params;

  const workspacePath = resolveWorkspacePath(workspaceFolder.trim());
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
  notes.push('2. Ensure the policy repository is cloned to ./policy directory');
  notes.push('3. If using avmsec with severity filter, create the severity exception file');
  notes.push('4. Run: conftest ' + args.join(' '));
  notes.push('');
  notes.push('To clone the AVM policy repository:');
  notes.push('  git clone https://github.com/Azure/policy-library-avm.git policy');

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

  const workspacePath = resolveWorkspacePath(folderName.trim());
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
  notes.push('3. Ensure policy directory is present: git clone https://github.com/Azure/policy-library-avm.git policy');
  notes.push('4. Run: conftest ' + args.join(' '));

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
