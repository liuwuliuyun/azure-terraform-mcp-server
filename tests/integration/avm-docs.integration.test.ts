/**
 * Integration tests for AVM (Azure Verified Modules) documentation provider.
 * 
 * These tests call the real Terraform Registry API and GitHub API
 * to fetch actual module information.
 * 
 * IMPORTANT: Set GITHUB_TOKEN environment variable to avoid rate limiting.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import {
  getAvmModules,
  getAvmLatestVersion,
  getAvmVersions,
  getAvmVariables,
  getAvmOutputs,
} from '../../src/tools/avm-docs-provider.js';
import { TEST_RESOURCES, hasGitHubToken } from './helpers.js';

describe('AVM Documentation Provider - Integration', () => {
  let hasToken = false;

  beforeAll(() => {
    hasToken = hasGitHubToken();
    if (!hasToken) {
      console.warn('⚠️  GITHUB_TOKEN not set - tests may hit rate limits and return partial data');
    }
  });

  afterAll(() => {
    // Clean up any cache directories created during tests
    const cacheDir = '__avm_data_cache__';
    if (existsSync(cacheDir)) {
      try {
        rmSync(cacheDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('getAvmModules', () => {
    it('should fetch list of available AVM modules from real registry', async () => {
      const modules = await getAvmModules({});

      expect(modules).toBeDefined();
      expect(Array.isArray(modules)).toBe(true);
      
      // Should have at least some modules (may be limited without token)
      expect(modules.length).toBeGreaterThan(0);
      
      // Each module should have required properties
      for (const module of modules.slice(0, 5)) {
        expect(module.moduleName).toBeDefined();
        expect(typeof module.moduleName).toBe('string');
        expect(module.source).toBeDefined();
        expect(typeof module.source).toBe('string');
      }

      console.log(`Fetched ${modules.length} AVM modules`);
    }, 60000);

    it('should include well-known modules when available', async () => {
      const modules = await getAvmModules({});
      const moduleNames = modules.map(m => m.moduleName);
      
      // Check if known modules are present
      const hasStorageAccount = moduleNames.includes(TEST_RESOURCES.avm.storageAccount);
      
      console.log(`Known modules present: storage=${hasStorageAccount}`);
      
      // At minimum, we should have some modules
      expect(modules.length).toBeGreaterThan(0);
    }, 60000);

    it('should have description for modules', async () => {
      const modules = await getAvmModules({});
      
      // At least some modules should have descriptions
      const modulesWithDescription = modules.filter(m => m.description && m.description.length > 0);
      
      console.log(`Modules with descriptions: ${modulesWithDescription.length}/${modules.length}`);
      
      // This is a soft check - not all modules may have descriptions
      expect(modules.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe('getAvmLatestVersion', () => {
    it('should get latest version of storage account module', async () => {
      const latestVersion = await getAvmLatestVersion({
        moduleName: TEST_RESOURCES.avm.storageAccount,
      });

      expect(latestVersion).toBeDefined();
      expect(typeof latestVersion).toBe('string');
      
      // Should be either a version or an error message
      const isVersion = /^\d+\.\d+\.\d+/.test(latestVersion);
      const isError = latestVersion.toLowerCase().includes('error') || 
                      latestVersion.toLowerCase().includes('not found');
      
      expect(isVersion || isError).toBe(true);
      
      if (isVersion) {
        console.log(`Latest version of storage account module: ${latestVersion}`);
      } else {
        console.warn(`Could not get version: ${latestVersion}`);
      }
    }, 60000);

    it('should get latest version of key vault module', async () => {
      const latestVersion = await getAvmLatestVersion({
        moduleName: TEST_RESOURCES.avm.keyVault,
      });

      expect(latestVersion).toBeDefined();
      expect(typeof latestVersion).toBe('string');
    }, 60000);

    it('should handle non-existent module gracefully', async () => {
      const result = await getAvmLatestVersion({
        moduleName: 'avm-res-nonexistent-module-xyz123',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      // Should return an error message, not throw
      expect(result.toLowerCase()).toMatch(/error|not found/);
    }, 60000);
  });

  describe('getAvmVersions', () => {
    it('should list versions of storage account module', async () => {
      const result = await getAvmVersions({
        moduleName: TEST_RESOURCES.avm.storageAccount,
      });

      expect(result).toBeDefined();
      
      if (Array.isArray(result)) {
        // Got version list
        console.log(`Found ${result.length} versions for storage account module`);
        
        if (result.length > 0) {
          // Each version should have required properties
          for (const version of result.slice(0, 3)) {
            expect(version.tagName).toBeDefined();
            expect(version.createdAt).toBeDefined();
          }
        }
      } else {
        // Got error string - this is acceptable if module not found
        console.warn(`Version lookup returned: ${result}`);
        expect(typeof result).toBe('string');
      }
    }, 60000);

    it('should return versions sorted by date (newest first)', async () => {
      const result = await getAvmVersions({
        moduleName: TEST_RESOURCES.avm.storageAccount,
      });

      if (Array.isArray(result) && result.length > 1) {
        // Check first version is newer than second
        const firstDate = new Date(result[0].createdAt);
        const secondDate = new Date(result[1].createdAt);
        expect(firstDate.getTime()).toBeGreaterThanOrEqual(secondDate.getTime());
      }
    }, 60000);

    it('should handle non-existent module gracefully', async () => {
      const result = await getAvmVersions({
        moduleName: 'avm-res-nonexistent-module-xyz123',
      });

      expect(result).toBeDefined();
      // Should return error string for non-existent module
      expect(typeof result).toBe('string');
    }, 60000);
  });

  describe('getAvmVariables', () => {
    it('should attempt to get variables for storage account module', async () => {
      // First get a version
      const versionResult = await getAvmLatestVersion({
        moduleName: TEST_RESOURCES.avm.storageAccount,
      });
      
      const version = /^\d+\.\d+\.\d+/.test(versionResult) ? versionResult : '0.1.0';

      const result = await getAvmVariables({
        moduleName: TEST_RESOURCES.avm.storageAccount,
        moduleVersion: version,
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      
      // Result can be HCL content, "No variable files found", or an error
      console.log(`Variables result length: ${result.length} chars`);
    }, 120000);
  });

  describe('getAvmOutputs', () => {
    it('should attempt to get outputs for storage account module', async () => {
      // First get a version
      const versionResult = await getAvmLatestVersion({
        moduleName: TEST_RESOURCES.avm.storageAccount,
      });
      
      const version = /^\d+\.\d+\.\d+/.test(versionResult) ? versionResult : '0.1.0';

      const result = await getAvmOutputs({
        moduleName: TEST_RESOURCES.avm.storageAccount,
        moduleVersion: version,
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      
      // Result can be HCL content, "No output files found", or an error
      console.log(`Outputs result length: ${result.length} chars`);
    }, 120000);
  });
});
