/**
 * Integration test helpers and utilities.
 * 
 * These helpers provide environment detection and skip logic for integration tests.
 */

import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// ==========================================
// Environment Detection
// ==========================================

/**
 * Check if GitHub token is available.
 */
export function hasGitHubToken(): boolean {
  return !!process.env.GITHUB_TOKEN;
}

/**
 * Check if Azure credentials are configured.
 */
export function hasAzureCredentials(): boolean {
  return !!(
    process.env.ARM_SUBSCRIPTION_ID &&
    process.env.ARM_TENANT_ID &&
    process.env.ARM_CLIENT_ID &&
    process.env.ARM_CLIENT_SECRET
  );
}

/**
 * Check if aztfexport tests should be skipped.
 */
export function shouldSkipAztfexportTests(): boolean {
  return process.env.SKIP_AZTFEXPORT_TESTS === 'true';
}

/**
 * Check if conftest tests should be skipped.
 */
export function shouldSkipConftestTests(): boolean {
  return process.env.SKIP_CONFTEST_TESTS === 'true';
}

/**
 * Get Azure subscription ID from environment.
 */
export function getAzureSubscriptionId(): string | undefined {
  return process.env.ARM_SUBSCRIPTION_ID;
}

// ==========================================
// Test Resource IDs
// ==========================================

/**
 * Known Azure resource types for testing documentation.
 * These are stable, well-documented resources.
 */
export const TEST_RESOURCES = {
  // Well-known AzureRM resources
  azurerm: {
    storageAccount: 'azurerm_storage_account',
    resourceGroup: 'azurerm_resource_group',
    virtualNetwork: 'azurerm_virtual_network',
    keyVault: 'azurerm_key_vault',
    cosmosdbAccount: 'azurerm_cosmosdb_account',
  },
  // Well-known AzAPI resource types
  azapi: {
    storageAccount: 'Microsoft.Storage/storageAccounts',
    virtualNetwork: 'Microsoft.Network/virtualNetworks',
    keyVault: 'Microsoft.KeyVault/vaults',
    webApp: 'Microsoft.Web/sites',
  },
  // Well-known AVM modules
  avm: {
    storageAccount: 'avm-res-storage-storageaccount',
    keyVault: 'avm-res-keyvault-vault',
    virtualNetwork: 'avm-res-network-virtualnetwork',
  },
};

// ==========================================
// Temporary Directory Management
// ==========================================

/**
 * Create a temporary directory for integration tests.
 */
export function createIntegrationTempDir(prefix = 'integration-test'): string {
  const tempDir = join(tmpdir(), `${prefix}_${Date.now()}_${randomBytes(4).toString('hex')}`);
  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up a temporary directory.
 */
export function cleanupTempDir(dir: string): void {
  try {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ==========================================
// Skip Helpers
// ==========================================

/**
 * Create a skip message with reason.
 */
export function skipMessage(reason: string): string {
  return `SKIPPED: ${reason}`;
}

/**
 * Common skip conditions.
 */
export const SKIP_CONDITIONS = {
  noAzureCredentials: 'Azure credentials not configured (ARM_* env vars)',
  noGitHubToken: 'GitHub token not available (may hit rate limits)',
  aztfexportNotInstalled: 'aztfexport is not installed',
  conftestNotInstalled: 'conftest is not installed',
  terraformNotInstalled: 'terraform is not installed',
  gitNotInstalled: 'git is not installed',
  manualSkip: 'Manually skipped via environment variable',
};
