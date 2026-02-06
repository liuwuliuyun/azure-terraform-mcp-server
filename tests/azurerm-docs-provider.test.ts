/**
 * Tests for tools/azurerm-docs-provider.ts
 * 
 * These tests focus on the parsing logic since the actual API calls
 * would require mocking fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAzureRMProviderDocumentation } from '../src/tools/azurerm-docs-provider.js';
import { SAMPLE_AZURERM_DOCS } from './helpers.js';
import { clearConfigCache } from '../src/core/config.js';

// ==========================================
// Mock Setup
// ==========================================

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  clearConfigCache();
  mockFetch.mockReset();
});

afterEach(() => {
  clearConfigCache();
});

// ==========================================
// getAzureRMProviderDocumentation
// ==========================================

describe('getAzureRMProviderDocumentation', () => {
  describe('successful documentation retrieval', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(SAMPLE_AZURERM_DOCS),
      });
    });

    it('should fetch and parse documentation', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_storage_account',
        docType: 'resource',
      });

      expect(result.resourceType).toBe('azurerm_storage_account');
      expect(result.documentationUrl).toContain('storage_account');
      expect(result.summary).toBeDefined();
      expect(result.arguments.length).toBeGreaterThan(0);
      expect(result.attributes.length).toBeGreaterThan(0);
    });

    it('should parse arguments correctly', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_storage_account',
        docType: 'resource',
      });

      // Check for known arguments from sample docs
      const nameArg = result.arguments.find((a) => a.name === 'name');
      expect(nameArg).toBeDefined();
      expect(nameArg?.required).toBe(true);

      const tagsArg = result.arguments.find((a) => a.name === 'tags');
      expect(tagsArg).toBeDefined();
      expect(tagsArg?.required).toBe(false);
    });

    it('should parse attributes correctly', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_storage_account',
        docType: 'resource',
      });

      // Always includes id
      const idAttr = result.attributes.find((a) => a.name === 'id');
      expect(idAttr).toBeDefined();

      // From sample docs
      const blobEndpoint = result.attributes.find((a) => 
        a.name === 'primary_blob_endpoint'
      );
      expect(blobEndpoint).toBeDefined();
    });

    it('should extract examples', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_storage_account',
        docType: 'resource',
      });

      expect(result.examples.length).toBeGreaterThan(0);
      expect(result.examples[0]).toContain('resource');
    });

    it('should extract notes', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_storage_account',
        docType: 'resource',
      });

      expect(result.notes.length).toBeGreaterThan(0);
    });

    it('should handle data-source docType', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_storage_account',
        docType: 'data-source',
      });

      expect(mockFetch).toHaveBeenCalled();
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('docs/d/');
    });

    it('should normalize resource type with azurerm_ prefix', async () => {
      await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_storage_account',
        docType: 'resource',
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('storage_account');
      expect(url).not.toContain('azurerm_azurerm');
    });
  });

  describe('argument filtering', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(SAMPLE_AZURERM_DOCS),
      });
    });

    it('should filter to specific argument', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_storage_account',
        docType: 'resource',
        argumentName: 'name',
      });

      expect(result.arguments.length).toBe(1);
      expect(result.arguments[0]?.name).toBe('name');
      expect(result.summary).toContain("Argument details for 'name'");
    });

    it('should handle non-existent argument', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_storage_account',
        docType: 'resource',
        argumentName: 'nonexistent_argument',
      });

      expect(result.arguments.length).toBe(0);
      expect(result.summary).toContain('not found');
    });
  });

  describe('attribute filtering', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(SAMPLE_AZURERM_DOCS),
      });
    });

    it('should filter to specific attribute', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_storage_account',
        docType: 'resource',
        attributeName: 'id',
      });

      expect(result.attributes.length).toBe(1);
      expect(result.attributes[0]?.name).toBe('id');
      expect(result.summary).toContain("Attribute details for 'id'");
    });

    it('should handle non-existent attribute', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_storage_account',
        docType: 'resource',
        attributeName: 'nonexistent_attribute',
      });

      expect(result.attributes.length).toBe(0);
      expect(result.summary).toContain('not found');
    });
  });

  describe('error handling', () => {
    it('should handle 404 response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'nonexistent_resource',
        docType: 'resource',
      });

      expect(result.summary).toContain('not found');
      expect(result.arguments).toEqual([]);
      expect(result.attributes).toEqual([]);
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_storage_account',
        docType: 'resource',
      });

      expect(result.summary).toContain('Error retrieving documentation');
      expect(result.summary).toContain('Network error');
    });

    it('should fallback to other doc type on 404', async () => {
      // First call (resource) returns 404, second call (data-source) succeeds
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(SAMPLE_AZURERM_DOCS),
        });

      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_storage_account',
        docType: 'resource',
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.arguments.length).toBeGreaterThan(0);
    });
  });

  describe('GitHub token handling', () => {
    it('should include authorization header when token is set', async () => {
      process.env['GITHUB_TOKEN'] = 'test-token';
      clearConfigCache();

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(SAMPLE_AZURERM_DOCS),
      });

      await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_storage_account',
        docType: 'resource',
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('token test-token');

      delete process.env['GITHUB_TOKEN'];
      clearConfigCache();
    });
  });
});

// ==========================================
// Edge Cases
// ==========================================

describe('edge cases', () => {
  it('should handle empty markdown content', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
    });

    const result = await getAzureRMProviderDocumentation({
      resourceTypeName: 'azurerm_empty',
      docType: 'resource',
    });

    // Should return defaults when no content can be parsed
    expect(result.resourceType).toBe('azurerm_empty');
    expect(Array.isArray(result.arguments)).toBe(true);
    expect(Array.isArray(result.attributes)).toBe(true);
  });

  it('should handle markdown without arguments section', async () => {
    const noArgsMarkdown = `
---
subcategory: "Test"
---

# azurerm_test

Some description.

## Example Usage

\`\`\`hcl
resource "azurerm_test" "example" {}
\`\`\`
`;

    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(noArgsMarkdown),
    });

    const result = await getAzureRMProviderDocumentation({
      resourceTypeName: 'azurerm_test',
      docType: 'resource',
    });

    // Should return default arguments
    expect(result.arguments.length).toBeGreaterThan(0);
    expect(result.arguments.some((a) => a.name === 'name')).toBe(true);
  });

  it('should handle data-source docType format', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SAMPLE_AZURERM_DOCS),
    });

    await getAzureRMProviderDocumentation({
      resourceTypeName: 'azurerm_storage_account',
      docType: 'data-source',
    });

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('docs/d/');
  });
});
