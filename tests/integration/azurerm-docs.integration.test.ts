/**
 * Integration tests for AzureRM documentation provider.
 * 
 * These tests call the real GitHub raw content API to fetch actual
 * Terraform provider documentation.
 * 
 * IMPORTANT: Set GITHUB_TOKEN environment variable to avoid rate limiting.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getAzureRMProviderDocumentation } from '../../src/tools/azurerm-docs-provider.js';
import { TEST_RESOURCES, hasGitHubToken } from './helpers.js';

describe('AzureRM Documentation Provider - Integration', () => {
  beforeAll(() => {
    if (!hasGitHubToken()) {
      console.warn('⚠️  GITHUB_TOKEN not set - tests may hit rate limits');
    }
  });

  describe('getAzureRMProviderDocumentation', () => {
    it('should fetch real documentation for azurerm_storage_account', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: TEST_RESOURCES.azurerm.storageAccount,
        docType: 'resource',
      });

      expect(result).toBeDefined();
      expect(result.resourceType).toBe(TEST_RESOURCES.azurerm.storageAccount);
      expect(result.documentationUrl).toContain('github');
      expect(result.documentationUrl).toContain('storage_account');
      
      // Should have summary content
      expect(result.summary).toBeDefined();
      expect(result.summary.length).toBeGreaterThan(0);
      
      // Should have arguments parsed from real docs
      expect(result.arguments).toBeDefined();
      expect(result.arguments.length).toBeGreaterThan(0);
      
      // Log what we found for debugging
      console.log(`Summary length: ${result.summary.length} chars`);
      console.log(`Arguments found: ${result.arguments.length}`);
      console.log(`Attributes found: ${result.attributes.length}`);
      console.log(`Examples found: ${result.examples.length}`);
      
      // Verify expected arguments exist (these are core arguments)
      const argNames = result.arguments.map(a => a.name);
      expect(argNames).toContain('name');
      expect(argNames).toContain('resource_group_name');
      expect(argNames).toContain('location');
    }, 30000);

    it('should fetch documentation for azurerm_resource_group', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: TEST_RESOURCES.azurerm.resourceGroup,
        docType: 'resource',
      });

      expect(result.resourceType).toBe(TEST_RESOURCES.azurerm.resourceGroup);
      expect(result.arguments.length).toBeGreaterThan(0);
      
      const argNames = result.arguments.map(a => a.name);
      expect(argNames).toContain('name');
      expect(argNames).toContain('location');
    }, 30000);

    it('should fetch documentation for azurerm_virtual_network', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: TEST_RESOURCES.azurerm.virtualNetwork,
        docType: 'resource',
      });

      expect(result.resourceType).toBe(TEST_RESOURCES.azurerm.virtualNetwork);
      expect(result.arguments.length).toBeGreaterThan(0);
      
      const argNames = result.arguments.map(a => a.name);
      expect(argNames).toContain('name');
    }, 30000);

    it('should fetch documentation for azurerm_key_vault', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: TEST_RESOURCES.azurerm.keyVault,
        docType: 'resource',
      });

      expect(result.resourceType).toBe(TEST_RESOURCES.azurerm.keyVault);
      expect(result.arguments.length).toBeGreaterThan(0);
      
      const argNames = result.arguments.map(a => a.name);
      expect(argNames).toContain('name');
    }, 30000);

    it('should fetch data source documentation', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_subscription',
        docType: 'data-source',
      });

      expect(result.resourceType).toBe('azurerm_subscription');
      expect(result.documentationUrl).toContain('docs/d/');
    }, 30000);

    it('should filter to specific argument', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: TEST_RESOURCES.azurerm.storageAccount,
        docType: 'resource',
        argumentName: 'account_tier',
      });

      // Should only have the requested argument
      expect(result.arguments.length).toBe(1);
      expect(result.arguments[0].name).toBe('account_tier');
      expect(result.arguments[0].description).toBeDefined();
    }, 30000);

    it('should filter to specific attribute', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: TEST_RESOURCES.azurerm.storageAccount,
        docType: 'resource',
        attributeName: 'id',
      });

      // Should only have the requested attribute
      expect(result.attributes.length).toBe(1);
      expect(result.attributes[0].name).toBe('id');
    }, 30000);

    it('should handle resource type without azurerm_ prefix', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'storage_account', // Without prefix
        docType: 'resource',
      });

      expect(result.resourceType).toBe('storage_account');
      expect(result.arguments.length).toBeGreaterThan(0);
    }, 30000);

    it('should return not found for non-existent resource', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: 'azurerm_this_resource_does_not_exist_xyz123',
        docType: 'resource',
      });

      expect(result.summary).toContain('not found');
      expect(result.arguments).toHaveLength(0);
    }, 30000);

    it('should fetch complex resource with many arguments', async () => {
      const result = await getAzureRMProviderDocumentation({
        resourceTypeName: TEST_RESOURCES.azurerm.cosmosdbAccount,
        docType: 'resource',
      });

      expect(result.resourceType).toBe(TEST_RESOURCES.azurerm.cosmosdbAccount);
      // CosmosDB has many arguments
      expect(result.arguments.length).toBeGreaterThan(5);
      
      const argNames = result.arguments.map(a => a.name);
      expect(argNames).toContain('name');
    }, 30000);
  });
});
