/**
 * Conftest environment setup orchestrator.
 *
 * Main entry point for automated setup of conftest and policy libraries.
 * Orchestrates installation checks, auto-installation, and policy download
 * into a single coherent workflow.
 */

import { existsSync } from 'node:fs';
import {
  isCommandAvailable,
  resolveWorkspacePath,
} from '../core/utils.js';
import {
  installConftest,
  checkConftestInstalled,
  getConftestVersion,
} from './conftest-auto-installer.js';
import {
  clonePolicyLibrary,
  updatePolicyLibrary,
  getPolicyStatus,
} from './policy-manager.js';
import type {
  SetupEnvironmentResult,
  InstallationStepResult,
} from '../core/types.js';

// ==========================================
// Types
// ==========================================

export interface SetupParams {
  workspacePath?: string;
  confirmInstall?: boolean;
  skipPolicies?: boolean;
  verbose?: boolean;
}

// ==========================================
// Main Setup Function
// ==========================================

/**
 * Set up the conftest environment with automatic installation and policy download.
 *
 * Workflow:
 * 1. Check if conftest is installed
 * 2. If missing and confirmInstall=true, auto-install it
 * 3. Check if policy library is available in workspace
 * 4. If missing and skipPolicies=false, clone/update policies
 * 5. Return comprehensive status
 */
export async function setupConftestEnvironment(
  params: SetupParams = {}
): Promise<SetupEnvironmentResult> {
  const startTime = Date.now();
  const {
    workspacePath = process.cwd(),
    confirmInstall = false,
    skipPolicies = false,
    verbose = false,
  } = params;

  const resolvedWorkspace = resolveWorkspacePath(workspacePath, true);
  const actionsTaken: Array<'conftest-install' | 'policy-clone' | 'policy-update'> = [];
  const installationSteps: InstallationStepResult[] = [];
  let conftestInstalled = false;
  let conftestVersion: string | undefined;
  let conftestPath: string | undefined;
  let policiesAvailable = false;
  let policyPath: string | undefined;
  let policySets: string[] = [];
  let requiresRestart = false;
  const nextSteps: string[] = [];

  log(verbose, `Starting setup with workspace: ${resolvedWorkspace}`);

  // ==========================================
  // Phase 1: Check Conftest Installation
  // ==========================================

  log(verbose, 'Phase 1: Checking conftest installation...');
  conftestInstalled = await checkConftestInstalled();

  if (conftestInstalled) {
    conftestVersion = await getConftestVersion() || undefined;
    conftestPath = 'conftest';
    log(verbose, `Conftest found: ${conftestVersion}`);
  } else {
    log(verbose, 'Conftest not installed');

    // ==========================================
    // Phase 2: Install Conftest (if confirmed)
    // ==========================================

    if (confirmInstall) {
      log(verbose, 'Phase 2: Installing conftest...');

      const installResult = await installConftest({
        verbose,
        timeout: 300000, // 5 minutes
      });

      installationSteps.push(...installResult.steps);
      requiresRestart = installResult.requiresRestart;

      if (installResult.success) {
        conftestInstalled = true;
        conftestVersion = installResult.version;
        conftestPath = 'conftest';
        actionsTaken.push('conftest-install');
        log(verbose, 'Conftest installation successful');
      } else {
        log(verbose, `Conftest installation failed: ${installResult.error}`);
        const duration = Date.now() - startTime;
        return {
          success: false,
          message: 'Failed to install conftest',
          conftestInstalled: false,
          policiesAvailable: false,
          actionsTaken,
          requiresRestart: false,
          readyToValidate: false,
          executedAt: new Date(),
          duration,
          nextSteps: [
            'Ensure you have a package manager installed (scoop, brew, apt, dnf, etc.)',
            'Try manual installation from https://www.conftest.dev/install/',
            'Or contact your system administrator for help',
          ],
        };
      }
    } else {
      log(verbose, 'Skipping conftest installation (confirmInstall=false)');
      nextSteps.push('Run setup again with confirmInstall=true to install conftest');
    }
  }

  // ==========================================
  // Phase 3: Check Policy Library
  // ==========================================

  if (!skipPolicies && conftestInstalled) {
    log(verbose, 'Phase 3: Checking policy library...');

    const policyStatus = getPolicyStatus(resolvedWorkspace);
    policiesAvailable = policyStatus.available;
    policyPath = policyStatus.path;
    policySets = policyStatus.policySets;

    if (policiesAvailable) {
      log(verbose, `Policy library available with ${policySets.length} policy set(s)`);
    } else {
      log(verbose, 'Policy library not found or incomplete');

      // ==========================================
      // Phase 4: Clone/Update Policies
      // ==========================================

      log(verbose, 'Phase 4: Setting up policy library...');

      const policyDirPath = `${resolvedWorkspace}/policy`;

      if (existsSync(policyDirPath)) {
        // Try to update
        log(verbose, 'Attempting to update existing policy library...');
        const updateResult = await updatePolicyLibrary(resolvedWorkspace);

        if (updateResult.success) {
          policiesAvailable = true;
          policySets = updateResult.policySets;
          actionsTaken.push('policy-update');
          log(verbose, 'Policy library updated successfully');
        } else {
          log(verbose, `Policy update failed: ${updateResult.error}`);
          nextSteps.push(`Fix policy update issue: ${updateResult.error}`);
        }
      } else {
        // Clone new
        log(verbose, 'Cloning policy library...');
        const cloneResult = await clonePolicyLibrary(resolvedWorkspace);

        if (cloneResult.success) {
          policiesAvailable = true;
          policySets = cloneResult.policySets;
          policyPath = cloneResult.path;
          actionsTaken.push('policy-clone');
          log(verbose, 'Policy library cloned successfully');
        } else {
          log(verbose, `Policy clone failed: ${cloneResult.error}`);
          nextSteps.push(`Fix policy download issue: ${cloneResult.error}`);

          // Provide manual clone instructions
          nextSteps.push(
            'Manual alternative: cd ' +
            resolvedWorkspace +
            ' && git clone https://github.com/Azure/policy-library-avm.git policy'
          );
        }
      }
    }
  }

  // ==========================================
  // Phase 5: Final Verification & Status
  // ==========================================

  log(verbose, 'Phase 5: Final verification...');

  const readyToValidate = conftestInstalled && (skipPolicies || policiesAvailable);

  if (readyToValidate) {
    log(verbose, 'Setup complete - ready for validation');
  } else {
    if (!conftestInstalled) {
      nextSteps.push('Install conftest and run setup again');
    }
    if (!skipPolicies && !policiesAvailable) {
      nextSteps.push('Ensure policy library is available in workspace/policy');
    }
  }

  const duration = Date.now() - startTime;
  const message = buildStatusMessage(
    conftestInstalled,
    conftestVersion,
    policiesAvailable,
    policySets,
    actionsTaken,
    requiresRestart
  );

  return {
    success: readyToValidate,
    message,
    conftestInstalled,
    conftestVersion,
    conftestPath,
    installationSteps: installationSteps.length > 0 ? installationSteps : undefined,
    policiesAvailable,
    policyStatus: policiesAvailable
      ? {
        available: true,
        path: policyPath,
        policySets,
        gitRemote: 'https://github.com/Azure/policy-library-avm.git',
      }
      : undefined,
    actionsTaken,
    requiresRestart,
    restartInstructions: requiresRestart
      ? 'Please restart your terminal/shell for PATH changes to take effect'
      : undefined,
    readyToValidate,
    nextSteps: nextSteps.length > 0 ? nextSteps : undefined,
    executedAt: new Date(),
    duration,
  };
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Build a human-readable status message.
 */
function buildStatusMessage(
  conftestInstalled: boolean,
  conftestVersion: string | undefined,
  policiesAvailable: boolean,
  policySets: string[],
  actionsTaken: string[],
  requiresRestart: boolean
): string {
  const parts: string[] = [];

  // Conftest status
  if (conftestInstalled) {
    parts.push(`✅ Conftest ${conftestVersion || 'installed'}`);
  } else {
    parts.push('❌ Conftest not installed');
  }

  // Policies status
  if (policiesAvailable) {
    parts.push(`✅ Policies available (${policySets.length} set${policySets.length !== 1 ? 's' : ''})`);
  } else {
    parts.push('❌ Policies not available');
  }

  // Actions taken
  if (actionsTaken.length > 0) {
    parts.push(`📝 Actions: ${actionsTaken.join(', ')}`);
  }

  // Restart requirement
  if (requiresRestart) {
    parts.push('⚠️ Terminal restart may be needed');
  }

  return parts.join(' | ');
}

/**
 * Log helper.
 */
function log(verbose: boolean, message: string): void {
  if (verbose) {
    console.error(`[conftest-setup] ${message}`);
  }
}

/**
 * Enhanced version of checkConftestInstallation that supports auto-setup.
 *
 * This is the new public API that replaces the simpler check-only version.
 */
export async function checkConftestInstallationWithSetup(
  workspacePath?: string,
  autoSetup?: boolean
): Promise<SetupEnvironmentResult> {
  if (!autoSetup) {
    // Simple check-only mode
    const installed = await isCommandAvailable('conftest');
    const version = installed ? await getConftestVersion() || undefined : undefined;

    return {
      success: installed,
      message: installed
        ? `Conftest ${version} is installed and ready to use`
        : 'Conftest is not installed',
      conftestInstalled: installed,
      conftestVersion: version,
      policiesAvailable: false,
      actionsTaken: [],
      requiresRestart: false,
      readyToValidate: installed,
      executedAt: new Date(),
      nextSteps: !installed
        ? [
          'Install conftest: https://www.conftest.dev/install/',
          'Or run setup with autoSetup=true for automatic installation',
        ]
        : undefined,
    };
  }

  // Auto-setup mode with user confirmation
  return setupConftestEnvironment({
    workspacePath,
    confirmInstall: true,
    skipPolicies: false,
    verbose: false,
  });
}
