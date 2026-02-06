/**
 * Azure Export for Terraform (aztfexport) utilities for Azure Terraform MCP Server.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type {
  AztfexportInstallationResult,
  AztfexportResult,
  CheckAztfexportInstallationParamsType,
  ExportAzureResourceParamsType,
  ExportAzureResourceGroupParamsType,
  ExportAzureResourcesByQueryParamsType,
} from '../core/types.js';
import {
  executeCommand,
  isCommandAvailable,
  getCommandVersion,
  resolveWorkspacePath,
  AZTFEXPORT_INSTALLATION_HELP,
  TERRAFORM_INSTALLATION_HELP,
} from '../core/utils.js';

// ==========================================
// Helper Functions
// ==========================================

/**
 * Generate a unique output folder name.
 */
function generateOutputFolderName(prefix = 'aztfexport'): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const randomSuffix = randomBytes(3).toString('hex');
  return `${prefix}_${timestamp}_${randomSuffix}`;
}

/**
 * Get or create the output directory.
 */
function getOutputDirectory(outputFolderName?: string): string {
  const folderName = outputFolderName ?? generateOutputFolderName();
  const workDir = resolveWorkspacePath(folderName);

  mkdirSync(workDir, { recursive: true });
  return workDir;
}

/**
 * Create a temporary directory for aztfexport operations.
 */
function createTempDir(): string {
  const tempDir = join(tmpdir(), `aztfexport_tmp_${Date.now()}_${randomBytes(4).toString('hex')}`);
  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Move directory contents from source to destination.
 */
function moveDirectoryContents(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true });

  const entries = readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(source, entry.name);
    const destPath = join(destination, entry.name);

    // Remove existing item at destination
    if (existsSync(destPath)) {
      rmSync(destPath, { recursive: true, force: true });
    }

    // Move the item
    renameSync(srcPath, destPath);
  }
}

/**
 * Read generated Terraform files from output directory.
 */
function readGeneratedFiles(directory: string): Record<string, string> {
  const files: Record<string, string> = {};

  if (!existsSync(directory)) {
    return files;
  }

  const terraformExtensions = ['.tf', '.tfvars', '.json'];
  const terraformFiles = ['main.tf', 'terraform.tf', 'provider.tf', 'variables.tf', 'outputs.tf', 'import.tf'];

  try {
    const entries = readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) {continue;}

      const filePath = join(directory, entry.name);
      const ext = entry.name.substring(entry.name.lastIndexOf('.'));

      if (terraformExtensions.includes(ext) || terraformFiles.includes(entry.name)) {
        try {
          files[entry.name] = readFileSync(filePath, 'utf-8');
        } catch {
          files[entry.name] = `Error reading file`;
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return files;
}

/**
 * Clean up a temporary directory.
 */
function cleanupTempDir(tempDir: string): void {
  try {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

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
 * Export a single Azure resource to Terraform configuration.
 */
export async function exportAzureResource(
  params: ExportAzureResourceParamsType
): Promise<AztfexportResult> {
  const {
    resourceId,
    outputFolderName,
    provider = 'azurerm',
    resourceName,
    resourceType,
    dryRun = false,
    includeRoleAssignment = false,
    parallelism = 10,
    continueOnError = false,
  } = params;

  let tempDir: string | null = null;

  try {
    // Create temporary directory
    tempDir = createTempDir();

    // Build command
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

    // Execute command
    const result = await executeCommand('aztfexport', args, {
      cwd: tempDir,
      timeout: 600000, // 10 minutes
    });

    // Get final output directory
    const workDir = getOutputDirectory(outputFolderName);

    const exportResult: AztfexportResult = {
      exitCode: result.exitCode,
      success: result.exitCode === 0,
      command: result.command,
      stdout: result.stdout,
      stderr: result.stderr,
      outputDirectory: workDir,
      generatedFiles: {},
    };

    // If successful, move files from temp to destination
    if (result.exitCode === 0) {
      moveDirectoryContents(tempDir, workDir);
      exportResult.generatedFiles = readGeneratedFiles(workDir);
    }

    return exportResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: -1,
      success: false,
      error: message,
    };
  } finally {
    if (tempDir) {
      cleanupTempDir(tempDir);
    }
  }
}

/**
 * Export Azure resource group to Terraform configuration.
 */
export async function exportAzureResourceGroup(
  params: ExportAzureResourceGroupParamsType
): Promise<AztfexportResult> {
  const {
    resourceGroupName,
    outputFolderName,
    provider = 'azurerm',
    namePattern,
    typePattern,
    dryRun = false,
    includeRoleAssignment = false,
    parallelism = 10,
    continueOnError = false,
  } = params;

  let tempDir: string | null = null;

  try {
    // Create temporary directory
    tempDir = createTempDir();

    // Build command
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

    // Execute command
    const result = await executeCommand('aztfexport', args, {
      cwd: tempDir,
      timeout: 900000, // 15 minutes
    });

    // Get final output directory
    const workDir = getOutputDirectory(outputFolderName);

    const exportResult: AztfexportResult = {
      exitCode: result.exitCode,
      success: result.exitCode === 0,
      command: result.command,
      stdout: result.stdout,
      stderr: result.stderr,
      outputDirectory: workDir,
      generatedFiles: {},
    };

    // If successful, move files from temp to destination
    if (result.exitCode === 0) {
      moveDirectoryContents(tempDir, workDir);
      exportResult.generatedFiles = readGeneratedFiles(workDir);
    }

    return exportResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: -1,
      success: false,
      error: message,
    };
  } finally {
    if (tempDir) {
      cleanupTempDir(tempDir);
    }
  }
}

/**
 * Export Azure resources by Azure Resource Graph query.
 */
export async function exportAzureResourcesByQuery(
  params: ExportAzureResourcesByQueryParamsType
): Promise<AztfexportResult> {
  const {
    query,
    outputFolderName,
    provider = 'azurerm',
    namePattern,
    typePattern,
    dryRun = false,
    includeRoleAssignment = false,
    parallelism = 10,
    continueOnError = false,
  } = params;

  let tempDir: string | null = null;

  try {
    // Create temporary directory
    tempDir = createTempDir();

    // Build command
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

    // Execute command
    const result = await executeCommand('aztfexport', args, {
      cwd: tempDir,
      timeout: 900000, // 15 minutes
    });

    // Get final output directory
    const workDir = getOutputDirectory(outputFolderName);

    const exportResult: AztfexportResult = {
      exitCode: result.exitCode,
      success: result.exitCode === 0,
      command: result.command,
      stdout: result.stdout,
      stderr: result.stderr,
      outputDirectory: workDir,
      generatedFiles: {},
    };

    // If successful, move files from temp to destination
    if (result.exitCode === 0) {
      moveDirectoryContents(tempDir, workDir);
      exportResult.generatedFiles = readGeneratedFiles(workDir);
    }

    return exportResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: -1,
      success: false,
      error: message,
    };
  } finally {
    if (tempDir) {
      cleanupTempDir(tempDir);
    }
  }
}
