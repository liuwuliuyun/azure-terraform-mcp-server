/**
 * Integration tests for aztfexport runner.
 * 
 * These tests require:
 * - aztfexport installed and in PATH
 * - terraform installed and in PATH
 * - Azure credentials configured (ARM_* environment variables)
 * - An active Azure subscription with resources to export
 * 
 * Set SKIP_AZTFEXPORT_TESTS=true to skip these tests.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import {
  checkAztfexportInstallation,
  exportAzureResource,
  exportAzureResourceGroup,
  exportAzureResourcesByQuery,
} from '../../src/tools/aztfexport-runner.js';
import {
  ExportAzureResourceParams,
  ExportAzureResourceGroupParams,
  ExportAzureResourcesByQueryParams,
} from '../../src/core/types.js';
import {
  hasAzureCredentials,
  shouldSkipAztfexportTests,
  getAzureSubscriptionId,
} from './helpers.js';

// Helper to parse params with defaults applied (Zod applies defaults)
function parseResourceParams(input: { resourceId: string; [key: string]: unknown }) {
  return ExportAzureResourceParams.parse(input);
}

function parseResourceGroupParams(input: { resourceGroupName: string; [key: string]: unknown }) {
  return ExportAzureResourceGroupParams.parse(input);
}

function parseQueryParams(input: { query: string; [key: string]: unknown }) {
  return ExportAzureResourcesByQueryParams.parse(input);
}

describe('aztfexport Runner - Integration', () => {
  let aztfexportInstalled = false;
  let terraformInstalled = false;
  let hasCredentials = false;

  beforeAll(async () => {
    // Check prerequisites
    const installCheck = await checkAztfexportInstallation({});
    aztfexportInstalled = installCheck.installed;
    terraformInstalled = !!installCheck.terraformVersion;
    hasCredentials = hasAzureCredentials();

    if (!aztfexportInstalled) {
      console.warn('⚠️  aztfexport not installed - skipping export tests');
    }
    if (!terraformInstalled) {
      console.warn('⚠️  terraform not installed - skipping export tests');
    }
    if (!hasCredentials) {
      console.warn('⚠️  Azure credentials not configured - skipping export tests');
    }
  });

  describe('checkAztfexportInstallation', () => {
    it('should check installation status', async () => {
      const result = await checkAztfexportInstallation({});

      expect(result).toBeDefined();
      expect(typeof result.installed).toBe('boolean');
      expect(result.status).toBeDefined();
      expect(typeof result.status).toBe('string');

      if (result.installed) {
        expect(result.aztfexportVersion).toBeDefined();
        console.log(`aztfexport version: ${result.aztfexportVersion}`);
        
        if (result.terraformVersion) {
          console.log(`terraform version: ${result.terraformVersion}`);
        }
      } else {
        expect(result.installationHelp).toBeDefined();
      }
    });

    it('should provide installation help if not installed', async () => {
      const result = await checkAztfexportInstallation({});

      if (!result.installed) {
        expect(result.installationHelp).toBeDefined();
        expect(typeof result.installationHelp).toBe('object');
      }
    });
  });

  describe('exportAzureResource', () => {
    it.skipIf(shouldSkipAztfexportTests() || !aztfexportInstalled || !terraformInstalled || !hasCredentials)(
      'should export a storage account resource',
      async () => {
        const subscriptionId = getAzureSubscriptionId();
        
        // This test requires a real resource ID
        // You need to provide a valid resource ID for your subscription
        // Example format: /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Storage/storageAccounts/{name}
        const testResourceId = process.env.TEST_AZURE_RESOURCE_ID;
        
        if (!testResourceId) {
          console.warn('⚠️  TEST_AZURE_RESOURCE_ID not set - skipping resource export test');
          return;
        }

        const outputFolder = `test-export-${Date.now()}`;
        
        try {
          const result = await exportAzureResource(parseResourceParams({
            resourceId: testResourceId,
            outputFolderName: outputFolder,
            provider: 'azurerm',
            dryRun: true, // Dry run to avoid creating actual files
          }));

          expect(result).toBeDefined();
          expect(result.exitCode).toBeDefined();
          expect(result.command).toBeDefined();
          
          // Dry run should succeed without creating files
          if (result.success) {
            expect(result.stdout).toBeDefined();
          }
        } finally {
          // Clean up
          if (existsSync(outputFolder)) {
            rmSync(outputFolder, { recursive: true, force: true });
          }
        }
      },
      300000 // 5 minute timeout
    );

    it.skipIf(shouldSkipAztfexportTests() || !aztfexportInstalled || !terraformInstalled || !hasCredentials)(
      'should handle invalid resource ID gracefully',
      async () => {
        const result = await exportAzureResource(parseResourceParams({
          resourceId: '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/nonexistent/providers/Microsoft.Storage/storageAccounts/doesnotexist',
          outputFolderName: `test-invalid-${Date.now()}`,
          provider: 'azurerm',
          dryRun: true,
        }));

        expect(result).toBeDefined();
        // Should fail but not throw
        expect(result.success).toBe(false);
        expect(result.exitCode).not.toBe(0);
      },
      120000
    );

    it.skipIf(shouldSkipAztfexportTests() || !aztfexportInstalled || !terraformInstalled || !hasCredentials)(
      'should support azapi provider',
      async () => {
        const testResourceId = process.env.TEST_AZURE_RESOURCE_ID;
        
        if (!testResourceId) {
          console.warn('⚠️  TEST_AZURE_RESOURCE_ID not set - skipping test');
          return;
        }

        const result = await exportAzureResource(parseResourceParams({
          resourceId: testResourceId,
          provider: 'azapi',
          dryRun: true,
        }));

        expect(result).toBeDefined();
        expect(result.command).toContain('azapi');
      },
      300000
    );
  });

  describe('exportAzureResourceGroup', () => {
    it.skipIf(shouldSkipAztfexportTests() || !aztfexportInstalled || !terraformInstalled || !hasCredentials)(
      'should export a resource group',
      async () => {
        const testResourceGroup = process.env.TEST_AZURE_RESOURCE_GROUP;
        
        if (!testResourceGroup) {
          console.warn('⚠️  TEST_AZURE_RESOURCE_GROUP not set - skipping resource group export test');
          return;
        }

        const outputFolder = `test-rg-export-${Date.now()}`;
        
        try {
          const result = await exportAzureResourceGroup(parseResourceGroupParams({
            resourceGroupName: testResourceGroup,
            outputFolderName: outputFolder,
            provider: 'azurerm',
            dryRun: true,
          }));

          expect(result).toBeDefined();
          expect(result.exitCode).toBeDefined();
          expect(result.command).toContain(testResourceGroup);
        } finally {
          if (existsSync(outputFolder)) {
            rmSync(outputFolder, { recursive: true, force: true });
          }
        }
      },
      600000 // 10 minute timeout for resource groups
    );

    it.skipIf(shouldSkipAztfexportTests() || !aztfexportInstalled || !terraformInstalled || !hasCredentials)(
      'should handle non-existent resource group',
      async () => {
        const result = await exportAzureResourceGroup(parseResourceGroupParams({
          resourceGroupName: 'this-resource-group-does-not-exist-xyz123',
          dryRun: true,
        }));

        expect(result).toBeDefined();
        expect(result.success).toBe(false);
      },
      120000
    );
  });

  describe('exportAzureResourcesByQuery', () => {
    it.skipIf(shouldSkipAztfexportTests() || !aztfexportInstalled || !terraformInstalled || !hasCredentials)(
      'should export resources by query',
      async () => {
        const outputFolder = `test-query-export-${Date.now()}`;
        
        try {
          // Query for storage accounts (common resource type)
          const result = await exportAzureResourcesByQuery(parseQueryParams({
            query: "type == 'Microsoft.Storage/storageAccounts'",
            outputFolderName: outputFolder,
            provider: 'azurerm',
            dryRun: true,
          }));

          expect(result).toBeDefined();
          expect(result.exitCode).toBeDefined();
          expect(result.command).toBeDefined();
        } finally {
          if (existsSync(outputFolder)) {
            rmSync(outputFolder, { recursive: true, force: true });
          }
        }
      },
      600000
    );

    it.skipIf(shouldSkipAztfexportTests() || !aztfexportInstalled || !terraformInstalled || !hasCredentials)(
      'should handle query with no results',
      async () => {
        const result = await exportAzureResourcesByQuery(parseQueryParams({
          query: "type == 'Microsoft.NonExistent/resources'",
          dryRun: true,
        }));

        expect(result).toBeDefined();
        // May succeed with empty results or fail
        expect(result.exitCode).toBeDefined();
      },
      120000
    );
  });
});
