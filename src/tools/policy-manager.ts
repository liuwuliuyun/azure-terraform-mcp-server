/**
 * Policy library management for conftest.
 *
 * Handles cloning, updating, and verification of the Azure policy library
 * from https://github.com/Azure/policy-library-avm.git
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isCommandAvailable } from '../core/utils.js';
import type { PolicyLibraryStatus } from '../core/types.js';

// ==========================================
// Constants
// ==========================================

const POLICY_REPO_URL = 'https://github.com/Azure/policy-library-avm.git';
const POLICY_DIR_NAME = 'policy';
const EXPECTED_POLICY_SETS = [
  'avmsec',
  'Azure-Proactive-Resiliency-Library-v2',
];

// ==========================================
// Types
// ==========================================

export interface PolicySetupResult {
  success: boolean;
  message: string;
  path?: string;
  policySets: string[];
  actionTaken?: 'cloned' | 'updated' | 'verified';
  error?: string;
}

export interface PolicyVerification {
  valid: boolean;
  path: string;
  availableSets: string[];
  missingExpected: string[];
  totalFiles: number;
}

// ==========================================
// Main Functions
// ==========================================

/**
 * Get the policy directory path for a workspace.
 */
export function getPolicyPath(workspacePath: string): string {
  return join(workspacePath, POLICY_DIR_NAME);
}

/**
 * Clone the Azure policy library to a workspace.
 */
export async function clonePolicyLibrary(workspacePath: string): Promise<PolicySetupResult> {
  // Check if git is available
  const gitAvailable = await isCommandAvailable('git');
  if (!gitAvailable) {
    return {
      success: false,
      message: 'git is not installed or not available in PATH',
      policySets: [],
      error: 'git is required to clone policy library. Please install git first.',
    };
  }

  const policyPath = getPolicyPath(workspacePath);

  // Check if policy directory already exists
  if (existsSync(policyPath)) {
    return {
      success: false,
      message: 'Policy directory already exists',
      path: policyPath,
      policySets: [],
      error: `${policyPath} already exists. Use updatePolicyLibrary() instead.`,
    };
  }

  // Ensure workspace directory exists
  if (!existsSync(workspacePath)) {
    try {
      mkdirSync(workspacePath, { recursive: true });
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create workspace directory',
        policySets: [],
        error: `Failed to create ${workspacePath}: ${String(error)}`,
      };
    }
  }

  try {
    const command = `git clone ${POLICY_REPO_URL} ${policyPath}`;
    execSync(command, {
      cwd: workspacePath,
      stdio: 'pipe',
      timeout: 300000, // 5 minutes
    });

    // Verify the clone was successful
    const verification = verifyPolicyDirectory(policyPath);

    if (!verification.valid) {
      // Clean up failed clone
      try {
        rmSync(policyPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }

      return {
        success: false,
        message: 'Policy clone verification failed',
        policySets: verification.availableSets,
        error: `Clone succeeded but verification failed. Missing: ${verification.missingExpected.join(', ')}`,
      };
    }

    return {
      success: true,
      message: 'Policy library cloned successfully',
      path: policyPath,
      policySets: verification.availableSets,
      actionTaken: 'cloned',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: 'Failed to clone policy library',
      policySets: [],
      error: errorMsg,
    };
  }
}

/**
 * Update an existing policy library.
 */
export async function updatePolicyLibrary(workspacePath: string): Promise<PolicySetupResult> {
  const gitAvailable = await isCommandAvailable('git');
  if (!gitAvailable) {
    return {
      success: false,
      message: 'git is not installed or not available in PATH',
      policySets: [],
      error: 'git is required to update policy library.',
    };
  }

  const policyPath = getPolicyPath(workspacePath);

  // Check if policy directory exists
  if (!existsSync(policyPath)) {
    return {
      success: false,
      message: 'Policy directory does not exist',
      policySets: [],
      error: `${policyPath} not found. Use clonePolicyLibrary() instead.`,
    };
  }

  try {
    // Check if it's a valid git repository
    execSync('git status', {
      cwd: policyPath,
      stdio: 'pipe',
      timeout: 30000,
    });
  } catch {
    return {
      success: false,
      message: 'Policy directory is not a valid git repository',
      policySets: [],
      error: `${policyPath} is not a git repository`,
    };
  }

  try {
    execSync('git pull --ff-only', {
      cwd: policyPath,
      stdio: 'pipe',
      timeout: 300000, // 5 minutes
    });

    // Verify the update was successful
    const verification = verifyPolicyDirectory(policyPath);

    return {
      success: verification.valid,
      message: verification.valid ? 'Policy library updated successfully' : 'Update completed but verification has issues',
      path: policyPath,
      policySets: verification.availableSets,
      actionTaken: 'updated',
      error: verification.valid ? undefined : `Missing: ${verification.missingExpected.join(', ')}`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: 'Failed to update policy library',
      policySets: [],
      error: errorMsg,
    };
  }
}

/**
 * Verify that a policy directory has the expected structure.
 */
export function verifyPolicyDirectory(policyPath: string): PolicyVerification {
  const availableSets: string[] = [];
  const missingExpected: string[] = [];
  let totalFiles = 0;

  if (!existsSync(policyPath)) {
    return {
      valid: false,
      path: policyPath,
      availableSets: [],
      missingExpected: EXPECTED_POLICY_SETS,
      totalFiles: 0,
    };
  }

  try {
    const entries = readdirSync(policyPath, { withFileTypes: true });

    // Count files and identify policy sets
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Check if it's a known policy set
        if (EXPECTED_POLICY_SETS.includes(entry.name)) {
          availableSets.push(entry.name);
        }

        // Count all files recursively in subdirectories
        const subFiles = countFilesRecursively(join(policyPath, entry.name));
        totalFiles += subFiles;
      } else {
        totalFiles++;
      }
    }

    // Find missing expected sets
    for (const expectedSet of EXPECTED_POLICY_SETS) {
      if (!availableSets.includes(expectedSet)) {
        missingExpected.push(expectedSet);
      }
    }

    const valid = missingExpected.length === 0;

    return {
      valid,
      path: policyPath,
      availableSets,
      missingExpected,
      totalFiles,
    };
  } catch (error) {
    return {
      valid: false,
      path: policyPath,
      availableSets: [],
      missingExpected: EXPECTED_POLICY_SETS,
      totalFiles: 0,
    };
  }
}

/**
 * Get the status of the policy library.
 */
export function getPolicyStatus(workspacePath: string): PolicyLibraryStatus {
  const policyPath = getPolicyPath(workspacePath);

  if (!existsSync(policyPath)) {
    return {
      available: false,
      policySets: [],
    };
  }

  const verification = verifyPolicyDirectory(policyPath);

  return {
    available: verification.valid,
    path: policyPath,
    policySets: verification.availableSets,
    gitRemote: POLICY_REPO_URL,
  };
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Recursively count files in a directory.
 */
function countFilesRecursively(dirPath: string): number {
  let count = 0;

  try {
    if (!existsSync(dirPath)) {
      return 0;
    }

    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += countFilesRecursively(join(dirPath, entry.name));
      } else {
        count++;
      }
    }
  } catch {
    // Ignore errors
  }

  return count;
}
