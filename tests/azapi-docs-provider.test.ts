/**
 * Tests for tools/azapi-docs-provider.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAzAPIProviderDocumentation, clearSchemaCache } from '../src/tools/azapi-docs-provider.js';

// ==========================================
// Mock Setup
// ==========================================

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  clearSchemaCache();
  mockFetch.mockReset();
});

afterEach(() => {
  clearSchemaCache();
});

// ==========================================
// getAzAPIProviderDocumentation
// ==========================================

describe('getAzAPIProviderDocumentation', () => {
  describe('online documentation fetch', () => {
    it('should return documentation URL when Azure docs respond', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
      });

      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: 'Microsoft.Storage/storageAccounts',
      });

      expect(result.resourceType).toBe('Microsoft.Storage/storageAccounts');
      expect(result.source).toBe('Azure REST API docs');
      expect(result.documentationUrl).toContain('docs.microsoft.com');
    });

    it('should fallback when Azure docs return 404', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: 'Microsoft.Unknown/resource',
      });

      expect(result.source).toBe('fallback');
      expect(result.documentationUrl).toContain('registry.terraform.io');
    });

    it('should fallback on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: 'Microsoft.Storage/storageAccounts',
      });

      expect(result.source).toBe('fallback');
    });

    it('should include apiVersion when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
      });

      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: 'Microsoft.Storage/storageAccounts',
        apiVersion: '2023-01-01',
      });

      expect(result.apiVersion).toBe('2023-01-01');
    });

    it('should use "latest" as default apiVersion', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
      });

      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: 'Microsoft.Storage/storageAccounts',
      });

      expect(result.apiVersion).toBe('latest');
    });
  });

  describe('error handling', () => {
    it('should return fallback result when fetch throws', async () => {
      // When fetch throws, the function catches it and returns fallback
      mockFetch.mockImplementation(() => {
        throw new Error('Network error');
      });

      const result = await getAzAPIProviderDocumentation({
        resourceTypeName: 'Microsoft.Storage/storageAccounts',
      });

      // The implementation catches fetch errors and returns fallback, not error
      expect(result.source).toBe('fallback');
      expect(result.documentationUrl).toContain('registry.terraform.io');
    });
  });

  describe('resource type handling', () => {
    it('should handle various resource type formats', async () => {
      mockFetch.mockResolvedValue({ ok: true });

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
