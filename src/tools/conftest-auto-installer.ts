/**
 * Conftest auto-installer module.
 *
 * Provides platform detection and automatic installation of conftest
 * with fallback mechanisms for different package managers.
 *
 * Supported platforms:
 * - Windows: scoop (preferred), choco (fallback), manual
 * - macOS: brew (preferred), manual
 * - Linux: apt (preferred), dnf, brew, manual
 */

import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import type {
  Platform,
  PackageManager,
  InstallationStepResult,
} from '../core/types.js';
import {
  isCommandAvailable,
  getCommandVersion,
} from '../core/utils.js';

// ==========================================
// Types
// ==========================================

export interface InstallerConfig {
  verbose?: boolean;
  dryRun?: boolean;
  timeout?: number; // milliseconds
}

export interface InstallResult {
  success: boolean;
  message: string;
  version?: string;
  path?: string;
  requiresRestart: boolean;
  steps: InstallationStepResult[];
  error?: string;
}

// ==========================================
// Platform Detection
// ==========================================

/**
 * Detect the current platform.
 */
export function detectPlatform(): Platform {
  const p = platform();
  switch (p) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    default:
      throw new Error(`Unsupported platform: ${p}`);
  }
}

/**
 * Detect available package managers for the current platform.
 */
export async function detectPackageManagers(p?: Platform): Promise<PackageManager[]> {
  const currentPlatform = p || detectPlatform();
  const managers: PackageManager[] = [];

  switch (currentPlatform) {
    case 'windows':
      // Try scoop first (no elevation needed)
      if (await isCommandAvailable('scoop')) {
        managers.push({
          name: 'scoop',
          available: true,
          command: 'scoop',
          requiresElevation: false,
        });
      }
      // Try choco (may need elevation)
      if (await isCommandAvailable('choco')) {
        managers.push({
          name: 'choco',
          available: true,
          command: 'choco',
          requiresElevation: true,
        });
      }
      // Manual is always available
      managers.push({
        name: 'manual',
        available: true,
        requiresElevation: false,
      });
      break;

    case 'macos':
      // Try brew
      if (await isCommandAvailable('brew')) {
        managers.push({
          name: 'brew',
          available: true,
          command: 'brew',
          requiresElevation: false,
        });
      }
      // Manual is always available
      managers.push({
        name: 'manual',
        available: true,
        requiresElevation: false,
      });
      break;

    case 'linux':
      // Try apt (Ubuntu/Debian)
      if (await isCommandAvailable('apt-get')) {
        managers.push({
          name: 'apt',
          available: true,
          command: 'apt-get',
          requiresElevation: true,
        });
      }
      // Try dnf (RHEL/CentOS)
      if (await isCommandAvailable('dnf')) {
        managers.push({
          name: 'dnf',
          available: true,
          command: 'dnf',
          requiresElevation: true,
        });
      }
      // Try brew (if installed)
      if (await isCommandAvailable('brew')) {
        managers.push({
          name: 'brew',
          available: true,
          command: 'brew',
          requiresElevation: false,
        });
      }
      // Manual is always available
      managers.push({
        name: 'manual',
        available: true,
        requiresElevation: false,
      });
      break;
  }

  return managers;
}

// ==========================================
// Installation Commands
// ==========================================

interface InstallCommand {
  command: string;
  args: string[];
  shell?: string;
}

/**
 * Get the install command for a specific platform and package manager.
 */
function getInstallCommand(platform: Platform, manager: PackageManager): InstallCommand | null {
  const { name } = manager;

  switch (platform) {
    case 'windows':
      if (name === 'scoop') {
        return {
          command: 'scoop',
          args: ['install', 'conftest'],
        };
      }
      if (name === 'choco') {
        return {
          command: 'choco',
          args: ['install', 'conftest', '-y'],
        };
      }
      if (name === 'manual') {
        // Return null for manual - requires user interaction
        return null;
      }
      break;

    case 'macos':
      if (name === 'brew') {
        return {
          command: 'brew',
          args: ['install', 'conftest'],
        };
      }
      if (name === 'manual') {
        return null;
      }
      break;

    case 'linux':
      if (name === 'apt') {
        return {
          command: 'apt-get',
          args: ['update'],
        };
        // Note: actual install is apt-get install conftest
        // but apt requires separate update first
      }
      if (name === 'dnf') {
        return {
          command: 'dnf',
          args: ['install', '-y', 'conftest'],
        };
      }
      if (name === 'brew') {
        return {
          command: 'brew',
          args: ['install', 'conftest'],
        };
      }
      if (name === 'manual') {
        return null;
      }
      break;
  }

  return null;
}

// ==========================================
// Installation Functions
// ==========================================

/**
 * Execute an install command and return the result.
 */
async function executeInstallCommand(
  cmd: InstallCommand,
  timeout: number = 120000
): Promise<{ success: boolean; output: string; error: string }> {
  const fullCommand = `${cmd.command} ${cmd.args.join(' ')}`;

  try {
    const output = execSync(fullCommand, {
      timeout,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return { success: true, output, error: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, output: '', error: message };
  }
}

/**
 * Install conftest using an available package manager.
 */
export async function installConftest(
  config: InstallerConfig = {}
): Promise<InstallResult> {
  const { verbose = false, dryRun = false, timeout = 120000 } = config;
  const steps: InstallationStepResult[] = [];
  const currentPlatform = detectPlatform();

  log(verbose, `Detecting platform: ${currentPlatform}`);

  // Step 1: Detect package managers
  let detectStep: InstallationStepResult;
  try {
    const managers = await detectPackageManagers(currentPlatform);
    const availableManagers = managers.filter((m) => m.available);

    if (availableManagers.length === 0) {
      detectStep = {
        step: 'detect',
        success: false,
        message: 'No package managers found',
        error: `No suitable package manager detected for ${currentPlatform}`,
      };
      steps.push(detectStep);
      return {
        success: false,
        message: 'Failed to detect package manager',
        steps,
        requiresRestart: false,
      };
    }

    detectStep = {
      step: 'detect',
      success: true,
      message: `Detected ${availableManagers.length} package manager(s)`,
      details: {
        platform: currentPlatform,
        managers: availableManagers.map((m) => m.name).join(', '),
      },
    };
    steps.push(detectStep);
    log(verbose, detectStep.message);
  } catch (error) {
    detectStep = {
      step: 'detect',
      success: false,
      message: 'Failed to detect platform',
      error: String(error),
    };
    steps.push(detectStep);
    return {
      success: false,
      message: 'Failed to detect platform',
      steps,
      requiresRestart: false,
    };
  }

  // Step 2: Try installation with each available manager
  let installStep: InstallationStepResult | null = null;
  const managers = await detectPackageManagers(currentPlatform);

  for (const manager of managers) {
    if (!manager.available) continue;

    const installCmd = getInstallCommand(currentPlatform, manager);
    if (!installCmd) {
      log(verbose, `Skipping ${manager.name} (manual install required)`);
      continue;
    }

    log(verbose, `Attempting installation with ${manager.name}...`);

    if (dryRun) {
      log(verbose, `[DRY RUN] Would execute: ${installCmd.command} ${installCmd.args.join(' ')}`);
      installStep = {
        step: 'install',
        success: true,
        message: `[DRY RUN] Would install with ${manager.name}`,
        requiresRestart: manager.requiresElevation,
      };
      steps.push(installStep);
      break;
    }

    const result = await executeInstallCommand(installCmd, timeout);
    if (result.success) {
      log(verbose, `Installation successful with ${manager.name}`);
      installStep = {
        step: 'install',
        success: true,
        message: `Installed conftest using ${manager.name}`,
        details: {
          manager: manager.name,
          command: `${installCmd.command} ${installCmd.args.join(' ')}`,
        },
        requiresRestart: manager.requiresElevation,
      };
      steps.push(installStep);
      break;
    } else {
      log(verbose, `Installation failed with ${manager.name}: ${result.error}`);
    }
  }

  if (!installStep) {
    return {
      success: false,
      message: 'Installation failed with all available package managers',
      steps,
      requiresRestart: false,
      error: 'No package manager could successfully install conftest',
    };
  }

  steps.push(installStep);

  // Step 3: Verify installation
  let verifyStep: InstallationStepResult;
  try {
    const installed = await isCommandAvailable('conftest');

    if (!installed) {
      if (installStep.requiresRestart) {
        verifyStep = {
          step: 'verify',
          success: false,
          message: 'Conftest not yet in PATH (terminal restart may be needed)',
          requiresRestart: true,
          error: 'conftest not found in PATH',
        };
      } else {
        verifyStep = {
          step: 'verify',
          success: false,
          message: 'Conftest installation verification failed',
          requiresRestart: false,
          error: 'conftest not found in PATH after installation',
        };
      }
    } else {
      const version = await getCommandVersion('conftest', '--version');
      verifyStep = {
        step: 'verify',
        success: true,
        message: `Verified conftest installation (${version})`,
        details: {
          version: version || 'unknown',
        },
        requiresRestart: false,
      };
    }

    steps.push(verifyStep);
  } catch (error) {
    verifyStep = {
      step: 'verify',
      success: false,
      message: 'Verification failed',
      error: String(error),
      requiresRestart: false,
    };
    steps.push(verifyStep);
  }

  const success = verifyStep.success;
  const version = installStep.details?.['version'];
  const requiresRestart = steps.some((s) => s.requiresRestart);

  return {
    success,
    message: success ? 'Conftest installed and verified' : 'Conftest installation incomplete',
    version,
    requiresRestart,
    steps,
  };
}

/**
 * Check if conftest is installed.
 */
export async function checkConftestInstalled(): Promise<boolean> {
  return isCommandAvailable('conftest');
}

/**
 * Get conftest version.
 */
export async function getConftestVersion(): Promise<string | null> {
  return getCommandVersion('conftest', '--version');
}

// ==========================================
// Helpers
// ==========================================

function log(verbose: boolean, message: string): void {
  if (verbose) {
    console.log(`[conftest-installer] ${message}`);
  }
}
