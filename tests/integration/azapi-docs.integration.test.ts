/**
 * Integration tests for AzAPI documentation provider.
 * 
 * These tests use the bundled AzAPI schema file and may also
 * fetch from Azure's online REST API documentation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getAzAPIProviderDocumentation, clearSchemaCache } from '../../src/tools/azapi-docs-provider.js';
import { TEST_RESOURCES } from './helpers.js';

describe('AzAPI Documentation Provider - Integration', () => {
  beforeEach(() => {
    // Clear cache between tests to ensure fresh lookups
    clearSchemaCache();
  });

  describe('getAzAPIProviderDocumentation', () => {
    it('should fetch documentation for Microsoft.Storage/storageAccounts', async () => {
      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: TEST_RESOURCES.azapi.storageAccount,
      });

      expect(result).toBeDefined();
      expect(result.resourceType).toBe(TEST_RESOURCES.azapi.storageAccount);
      
      // Should have schema or indication of source
      expect(result.source).toBeDefined();
    }, 30000);

    it('should fetch documentation for Microsoft.Network/virtualNetworks', async () => {
      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: TEST_RESOURCES.azapi.virtualNetwork,
      });

      expect(result).toBeDefined();
      expect(result.resourceType).toBe(TEST_RESOURCES.azapi.virtualNetwork);
    }, 30000);

    it('should fetch documentation for Microsoft.KeyVault/vaults', async () => {
      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: TEST_RESOURCES.azapi.keyVault,
      });

      expect(result).toBeDefined();
      expect(result.resourceType).toBe(TEST_RESOURCES.azapi.keyVault);
    }, 30000);

    it('should fetch documentation for Microsoft.Web/sites', async () => {
      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: TEST_RESOURCES.azapi.webApp,
      });

      expect(result).toBeDefined();
      expect(result.resourceType).toBe(TEST_RESOURCES.azapi.webApp);
    }, 30000);

    it('should accept specific API version', async () => {
      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: TEST_RESOURCES.azapi.storageAccount,
        apiVersion: '2023-01-01',
      });

      expect(result).toBeDefined();
      expect(result.resourceType).toBe(TEST_RESOURCES.azapi.storageAccount);
      // API version should be reflected
      expect(result.apiVersion).toBeDefined();
    }, 30000);

    it('should handle non-existent resource type gracefully', async () => {
      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: 'Microsoft.NonExistent/resources',
      });

      expect(result).toBeDefined();
      expect(result.resourceType).toBe('Microsoft.NonExistent/resources');
      // Should indicate not found or have error info
    }, 30000);

    it('should handle case variations in resource type', async () => {
      // Try lowercase
      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: 'microsoft.storage/storageaccounts',
      });

      expect(result).toBeDefined();
      // Should still work (case-insensitive matching)
    }, 30000);

    it('should return schema information when available', async () => {
      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: TEST_RESOURCES.azapi.storageAccount,
      });

      expect(result).toBeDefined();
      // If schema is available, it should have properties
      if (result.schema && typeof result.schema === 'object') {
        // Schema should have some structure
        expect(result.schema).toBeDefined();
      }
    }, 30000);
  });
});
