/**
 * Tests for tools/azapi-docs-provider.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAzAPIProviderDocumentation, clearSchemaCache } from '../src/tools/azapi-docs-provider.js';

// ==========================================
// Mock Setup
// ==========================================

// Mock the azapi-schema-generator module to control schema availability
vi.mock('../src/tools/azapi-schema-generator.js', () => ({
  initializeAzAPISchemas: vi.fn(),
  getAzAPISchema: vi.fn(),
  clearAzAPISchemaCache: vi.fn(),
}));

// Mock the azapi-examples-provider module to prevent real fetch calls
vi.mock('../src/tools/azapi-examples-provider.js', () => ({
  getExamplesForResourceType: vi.fn().mockResolvedValue([]),
  clearExamplesCache: vi.fn(),
}));

import { initializeAzAPISchemas, getAzAPISchema, clearAzAPISchemaCache } from '../src/tools/azapi-schema-generator.js';
import { getExamplesForResourceType } from '../src/tools/azapi-examples-provider.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  clearSchemaCache();
  mockFetch.mockReset();
  vi.mocked(initializeAzAPISchemas).mockReset();
  vi.mocked(getAzAPISchema).mockReset();
  vi.mocked(clearAzAPISchemaCache).mockReset();
});

afterEach(() => {
  clearSchemaCache();
});

// ==========================================
// getAzAPIProviderDocumentation
// ==========================================

describe('getAzAPIProviderDocumentation', () => {
  describe('schema loading and caching', () => {
    it('should return not_found when schema is not available', async () => {
      // When no schemas are loaded, return empty object
      vi.mocked(initializeAzAPISchemas).mockResolvedValue({});
      vi.mocked(getAzAPISchema).mockReturnValue('');

      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: 'Microsoft.Storage/storageAccounts',
      });

      expect(result.resourceType).toBe('Microsoft.Storage/storageAccounts');
      expect(result.source).toBe('not_found');
      expect(result.documentationUrl).toContain('registry.terraform.io');
    });

    it('should return not_found when resource type does not exist in schema', async () => {
      // Schemas exist but resource type is not found
      vi.mocked(initializeAzAPISchemas).mockResolvedValue({
        'microsoft.compute/virtualmachines': '# Schema for VMs'
      });
      vi.mocked(getAzAPISchema).mockReturnValue('');

      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: 'Microsoft.Unknown/nonExistentResource',
      });

      expect(result.source).toBe('not_found');
      expect(result.error).toContain('No schema found');
    });

    it('should return schema when resource type exists', async () => {
      const mockSchema = '# Resource Type: Microsoft.Storage/storageAccounts@2023-01-01\nAPI Version: 2023-01-01';
      vi.mocked(initializeAzAPISchemas).mockResolvedValue({
        'microsoft.storage/storageaccounts': mockSchema
      });
      vi.mocked(getAzAPISchema).mockReturnValue(mockSchema);

      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: 'Microsoft.Storage/storageAccounts',
      });

      expect(result.source).toBe('azapi_provider_schemas');
      expect(result.schema).toEqual({ documentation: mockSchema });
    });

    it('should include apiVersion when provided', async () => {
      vi.mocked(initializeAzAPISchemas).mockResolvedValue({});
      vi.mocked(getAzAPISchema).mockReturnValue('');

      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: 'Microsoft.Storage/storageAccounts',
        apiVersion: '2023-01-01',
      });

      expect(result.apiVersion).toBe('2023-01-01');
    });

    it('should use "latest" as default apiVersion', async () => {
      vi.mocked(initializeAzAPISchemas).mockResolvedValue({});
      vi.mocked(getAzAPISchema).mockReturnValue('');

      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: 'Microsoft.Storage/storageAccounts',
      });

      expect(result.apiVersion).toBe('latest');
    });
  });

  describe('error handling', () => {
    it('should handle schema loading errors gracefully', async () => {
      // When schema loading fails, return error
      vi.mocked(initializeAzAPISchemas).mockRejectedValue(new Error('Failed to load schemas'));

      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: 'Microsoft.Storage/storageAccounts',
      });

      // The implementation catches errors and returns error source
      expect(result.source).toBe('error');
      expect(result.error).toContain('Failed to load schemas');
    });
  });

  describe('resource type handling', () => {
    it('should handle various resource type formats', async () => {
      vi.mocked(initializeAzAPISchemas).mockResolvedValue({});
      vi.mocked(getAzAPISchema).mockReturnValue('');

      const resourceTypes = [
        'Microsoft.Compute/virtualMachines',
        'Microsoft.Network/virtualNetworks',
        'Microsoft.Web/sites',
        'Microsoft.KeyVault/vaults',
      ];

      for (const resourceType of resourceTypes) {
        const result = await getAzAPIProviderDocumentation({
          resourceTypeName: resourceType,
        });

        expect(result.resourceType).toBe(resourceType);
      }
    });
  });
});

// ==========================================
// clearSchemaCache
// ==========================================

describe('clearSchemaCache', () => {
  it('should clear cached schema', () => {
    // This is a simple function that just sets cache to null
    // We can verify it doesn't throw
    expect(() => clearSchemaCache()).not.toThrow();
  });
});
