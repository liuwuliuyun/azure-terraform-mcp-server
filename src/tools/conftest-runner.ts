/**
 * Conftest runner for Azure Verified Modules (AVM) policy validation.
 */

import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type {
  ConftestInstallationResult,
  ConftestValidationResult,
  PolicyViolation,
  CheckConftestInstallationParamsType,
  RunConftestWorkspaceValidationParamsType,
  RunConftestWorkspacePlanValidationParamsType,
} from '../core/types.js';
import {
  executeCommand,
  isCommandAvailable,
  getCommandVersion,
  resolveWorkspacePath,
  stripAnsiEscapeSequences,
  getDockerPathTip,
  CONFTEST_INSTALLATION_HELP,
} from '../core/utils.js';

// ==========================================
// Constants
// ==========================================

const AVM_POLICY_REPO_URL = 'https://github.com/Azure/policy-library-avm.git';

// ==========================================
// Policy Cache Management
// ==========================================

let policyCacheDir: string | null = null;

/**
 * Get the policy cache directory path.
 */
function getPolicyCacheDir(): string {
  if (policyCacheDir) {
    return policyCacheDir;
  }

  // Try relative to cwd (for bundled package)
  try {
    const dataDir = join(process.cwd(), 'data', 'avm_policy_cache');
    if (existsSync(join(process.cwd(), 'data'))) {
      policyCacheDir = dataDir;
      return policyCacheDir;
    }
  } catch {
    // Ignore
  }

  // Fall back to temp directory
  policyCacheDir = join(tmpdir(), 'avm_policy_cache');
  return policyCacheDir;
}

/**
 * Get policy set paths.
 */
function getPolicySetPaths(): Record<string, string> {
  const cacheDir = getPolicyCacheDir();
  const policyBase = join(cacheDir, 'policy');

  return {
    all: policyBase,
    'Azure-Proactive-Resiliency-Library-v2': join(policyBase, 'Azure-Proactive-Resiliency-Library-v2'),
    avmsec: join(policyBase, 'avmsec'),
  };
}

/**
 * Ensure the policy cache is initialized.
 */
async function ensurePolicyCache(): Promise<void> {
  const cacheDir = getPolicyCacheDir();
  const policyDir = join(cacheDir, 'policy');

  if (existsSync(policyDir)) {
    // Try to update if it's a git repo
    const gitDir = join(cacheDir, '.git');
    if (existsSync(gitDir)) {
      await executeCommand('git', ['pull'], { cwd: cacheDir, timeout: 60000 });
    }
    return;
  }

  // Clone the repository
  mkdirSync(cacheDir, { recursive: true });
  const result = await executeCommand('git', ['clone', AVM_POLICY_REPO_URL, cacheDir], {
    timeout: 120000,
  });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to clone AVM policy repository: ${result.stderr}`);
  }
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Create a temporary file and return its path.
 */
function createTempFile(content: string, suffix: string): string {
  const tempDir = tmpdir();
  const tempFile = join(tempDir, `conftest_${Date.now()}_${randomBytes(4).toString('hex')}${suffix}`);
  writeFileSync(tempFile, content, 'utf-8');
  return tempFile;
}

/**
 * Create severity exception content for avmsec policies.
 */
function createSeverityException(severityFilter: string): string {
  if (severityFilter === 'high') {
    return `package avmsec

import rego.v1

# Skip all policies except high severity
exception contains rules if {
  rules = rules_below_high
}`;
  }

  if (severityFilter === 'medium') {
    return `package avmsec

import rego.v1

# Skip all policies except high and medium severity
exception contains rules if {
  rules = rules_below_medium
}`;
  }

  if (severityFilter === 'low') {
    return `package avmsec

import rego.v1

# Skip all policies except high, medium, and low severity
exception contains rules if {
  rules = rules_below_low
}`;
  }

  return '';
}

/**
 * Parse conftest JSON output into violations.
 */
function parseConftestOutput(
  outputData: Array<{
    filename?: string;
    failures?: Array<{ rule?: string; msg?: string; metadata?: Record<string, unknown> }>;
    warnings?: Array<{ rule?: string; msg?: string; metadata?: Record<string, unknown> }>;
  }>
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  for (const result of outputData) {
    const filename = result.filename ?? 'unknown';

    for (const failure of result.failures ?? []) {
      violations.push({
        filename,
        level: 'failure',
        policy: failure.rule ?? 'unknown',
        message: failure.msg ?? 'Policy violation',
        metadata: failure.metadata,
      });
    }

    for (const warning of result.warnings ?? []) {
      violations.push({
        filename,
        level: 'warning',
        policy: warning.rule ?? 'unknown',
        message: warning.msg ?? 'Policy warning',
        metadata: warning.metadata,
      });
    }
  }

  return violations;
}

/**
 * Parse conftest text output as fallback.
 */
function parseConftestTextOutput(outputText: string): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const lines = outputText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && (trimmed.includes('FAIL') || trimmed.includes('WARN'))) {
      violations.push({
        filename: 'unknown',
        level: trimmed.includes('FAIL') ? 'failure' : 'warning',
        policy: 'unknown',
        message: trimmed,
      });
    }
  }

  return violations;
}

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
 * Validate Terraform files in a workspace folder against AVM policies.
 */
export async function runConftestWorkspaceValidation(
  params: RunConftestWorkspaceValidationParamsType
): Promise<ConftestValidationResult> {
  const { workspaceFolder, policySet = 'all', severityFilter, customPolicies } = params;

  if (!workspaceFolder?.trim()) {
    return {
      success: false,
      violations: [],
      summary: { totalViolations: 0, failures: 0, warnings: 0 },
      error: 'No workspace folder provided',
    };
  }

  let planFilePath: string | null = null;
  let exceptionFilePath: string | null = null;

  try {
    // Resolve workspace path
    const workspacePath = resolveWorkspacePath(workspaceFolder.trim());

    if (!existsSync(workspacePath)) {
      return {
        success: false,
        violations: [],
        summary: { totalViolations: 0, failures: 0, warnings: 0 },
        error: `Workspace folder "${workspaceFolder}" does not exist at ${workspacePath}${getDockerPathTip(workspaceFolder)}`,
        workspaceFolder,
      };
    }

    // Check for Terraform files
    const entries = readdirSync(workspacePath);
    const tfFiles = entries.filter((f) => f.endsWith('.tf'));

    if (tfFiles.length === 0) {
      return {
        success: false,
        violations: [],
        summary: { totalViolations: 0, failures: 0, warnings: 0 },
        error: `No .tf files found in workspace folder "${workspaceFolder}"`,
        workspaceFolder,
      };
    }

    // Ensure policy cache is available
    await ensurePolicyCache();

    // Initialize Terraform
    const initResult = await executeCommand('terraform', ['init'], {
      cwd: workspacePath,
      timeout: 120000,
    });

    if (initResult.exitCode !== 0) {
      return {
        success: false,
        violations: [],
        summary: { totalViolations: 0, failures: 0, warnings: 0 },
        error: `Terraform init failed: ${stripAnsiEscapeSequences(initResult.stderr)}`,
        workspaceFolder,
      };
    }

    // Create Terraform plan
    const planResult = await executeCommand('terraform', ['plan', '-out=tfplan.binary'], {
      cwd: workspacePath,
      timeout: 120000,
    });

    if (planResult.exitCode !== 0) {
      return {
        success: false,
        violations: [],
        summary: { totalViolations: 0, failures: 0, warnings: 0 },
        error: `Terraform plan failed: ${stripAnsiEscapeSequences(planResult.stderr)}`,
        workspaceFolder,
      };
    }

    // Convert plan to JSON
    const showResult = await executeCommand('terraform', ['show', '-json', 'tfplan.binary'], {
      cwd: workspacePath,
      timeout: 60000,
    });

    if (showResult.exitCode !== 0 || !showResult.stdout) {
      return {
        success: false,
        violations: [],
        summary: { totalViolations: 0, failures: 0, warnings: 0 },
        error: `Terraform show failed: ${stripAnsiEscapeSequences(showResult.stderr)}`,
        workspaceFolder,
      };
    }

    // Write plan JSON to temp file
    planFilePath = createTempFile(showResult.stdout, '.json');

    // Build conftest command
    const args: string[] = ['test', '--all-namespaces'];

    // Add policy path
    const policyPaths = getPolicySetPaths();
    const policyPath = policyPaths[policySet];

    if (!policyPath || !existsSync(policyPath)) {
      return {
        success: false,
        violations: [],
        summary: { totalViolations: 0, failures: 0, warnings: 0 },
        error: `Policy set "${policySet}" not found. Available: ${Object.keys(policyPaths).join(', ')}`,
        workspaceFolder,
      };
    }

    args.push('-p', policyPath);

    // Add severity exception if needed
    if (policySet === 'avmsec' && severityFilter) {
      const exceptionContent = createSeverityException(severityFilter);
      if (exceptionContent) {
        exceptionFilePath = createTempFile(exceptionContent, '.rego');
        args.push('-p', exceptionFilePath);
      }
    }

    // Add custom policies
    if (customPolicies) {
      const customPolicyPaths = customPolicies.split(',').map((p) => p.trim());
      for (const cp of customPolicyPaths) {
        if (cp) {args.push('-p', cp);}
      }
    }

    // Output format and plan file
    args.push('--output', 'json', planFilePath);

    // Run conftest
    const conftestResult = await executeCommand('conftest', args, { timeout: 300000 });

    // Parse results
    let violations: PolicyViolation[] = [];

    if (conftestResult.stdout) {
      try {
        const outputData = JSON.parse(conftestResult.stdout) as Array<unknown>;
        violations = parseConftestOutput(outputData as Parameters<typeof parseConftestOutput>[0]);
      } catch {
        violations = parseConftestTextOutput(conftestResult.stdout);
      }
    }

    const failures = violations.filter((v) => v.level === 'failure').length;
    const warnings = violations.filter((v) => v.level === 'warning').length;

    return {
      success: conftestResult.exitCode === 0,
      policySet,
      severityFilter,
      totalViolations: violations.length,
      violations,
      summary: {
        totalViolations: violations.length,
        failures,
        warnings,
        policySetUsed: policySet,
      },
      workspaceFolder,
      workspacePath,
      terraformFiles: tfFiles,
      commandOutput: conftestResult.exitCode !== 0 ? conftestResult.stdout : undefined,
      commandError: conftestResult.stderr || undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      violations: [],
      summary: { totalViolations: 0, failures: 0, warnings: 0 },
      error: `Error running conftest: ${stripAnsiEscapeSequences(message)}`,
      workspaceFolder,
    };
  } finally {
    // Cleanup temp files
    try {
      if (planFilePath) {unlinkSync(planFilePath);}
      if (exceptionFilePath) {unlinkSync(exceptionFilePath);}
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Validate a Terraform plan file against AVM policies.
 */
export async function runConftestWorkspacePlanValidation(
  params: RunConftestWorkspacePlanValidationParamsType
): Promise<ConftestValidationResult> {
  const { folderName, policySet = 'all', severityFilter, customPolicies } = params;

  if (!folderName?.trim()) {
    return {
      success: false,
      violations: [],
      summary: { totalViolations: 0, failures: 0, warnings: 0 },
      error: 'No folder name provided',
    };
  }

  let planJsonPath: string | null = null;
  let exceptionFilePath: string | null = null;

  try {
    // Resolve workspace path
    const workspacePath = resolveWorkspacePath(folderName.trim());

    if (!existsSync(workspacePath)) {
      return {
        success: false,
        violations: [],
        summary: { totalViolations: 0, failures: 0, warnings: 0 },
        error: `Folder "${folderName}" does not exist at ${workspacePath}${getDockerPathTip(folderName)}`,
      };
    }

    // Look for plan file
    const planBinaryPath = join(workspacePath, 'tfplan.binary');
    const planJsonFilePath = join(workspacePath, 'tfplan.json');

    if (existsSync(planJsonFilePath)) {
      // Use existing JSON plan
      planJsonPath = planJsonFilePath;
    } else if (existsSync(planBinaryPath)) {
      // Convert binary plan to JSON
      const showResult = await executeCommand('terraform', ['show', '-json', 'tfplan.binary'], {
        cwd: workspacePath,
        timeout: 60000,
      });

      if (showResult.exitCode !== 0 || !showResult.stdout) {
        return {
          success: false,
          violations: [],
          summary: { totalViolations: 0, failures: 0, warnings: 0 },
          error: `Failed to convert plan to JSON: ${stripAnsiEscapeSequences(showResult.stderr)}`,
        };
      }

      planJsonPath = createTempFile(showResult.stdout, '.json');
    } else {
      return {
        success: false,
        violations: [],
        summary: { totalViolations: 0, failures: 0, warnings: 0 },
        error: `No plan file found in "${folderName}". Expected tfplan.binary or tfplan.json`,
      };
    }

    // Ensure policy cache
    await ensurePolicyCache();

    // Build conftest command
    const args: string[] = ['test', '--all-namespaces'];

    const policyPaths = getPolicySetPaths();
    const policyPath = policyPaths[policySet];

    if (!policyPath || !existsSync(policyPath)) {
      return {
        success: false,
        violations: [],
        summary: { totalViolations: 0, failures: 0, warnings: 0 },
        error: `Policy set "${policySet}" not found`,
      };
    }

    args.push('-p', policyPath);

    // Severity exception
    if (policySet === 'avmsec' && severityFilter) {
      const exceptionContent = createSeverityException(severityFilter);
      if (exceptionContent) {
        exceptionFilePath = createTempFile(exceptionContent, '.rego');
        args.push('-p', exceptionFilePath);
      }
    }

    // Custom policies
    if (customPolicies) {
      const customPolicyPaths = customPolicies.split(',').map((p) => p.trim());
      for (const cp of customPolicyPaths) {
        if (cp) {args.push('-p', cp);}
      }
    }

    args.push('--output', 'json', planJsonPath);

    // Run conftest
    const conftestResult = await executeCommand('conftest', args, { timeout: 300000 });

    // Parse results
    let violations: PolicyViolation[] = [];

    if (conftestResult.stdout) {
      try {
        const outputData = JSON.parse(conftestResult.stdout) as Array<unknown>;
        violations = parseConftestOutput(outputData as Parameters<typeof parseConftestOutput>[0]);
      } catch {
        violations = parseConftestTextOutput(conftestResult.stdout);
      }
    }

    const failures = violations.filter((v) => v.level === 'failure').length;
    const warnings = violations.filter((v) => v.level === 'warning').length;

    return {
      success: conftestResult.exitCode === 0,
      policySet,
      severityFilter,
      totalViolations: violations.length,
      violations,
      summary: {
        totalViolations: violations.length,
        failures,
        warnings,
        policySetUsed: policySet,
      },
      planFile: planJsonPath,
      commandOutput: conftestResult.exitCode !== 0 ? conftestResult.stdout : undefined,
      commandError: conftestResult.stderr || undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      violations: [],
      summary: { totalViolations: 0, failures: 0, warnings: 0 },
      error: `Error running conftest: ${stripAnsiEscapeSequences(message)}`,
    };
  } finally {
    try {
      if (exceptionFilePath) {unlinkSync(exceptionFilePath);}
      // Only cleanup temp plan file, not existing ones
      if (planJsonPath && !planJsonPath.endsWith('tfplan.json')) {
        unlinkSync(planJsonPath);
      }
    } catch {
      // Ignore
    }
  }
}
