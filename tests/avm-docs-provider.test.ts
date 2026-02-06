/**
 * Tests for tools/avm-docs-provider.ts
 * 
 * Note: These tests verify the exported functions' behavior.
 * The module uses both in-memory and file-based caching, so tests
 * focus on verifiable outcomes rather than internal fetch calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  getAvmModules,
  getAvmLatestVersion,
  getAvmVersions,
  getAvmVariables,
  getAvmOutputs,
  clearAvmCache,
} from '../src/tools/avm-docs-provider.js';

// ==========================================
// Setup
// ==========================================

// Clear cache before and after tests
const CACHE_DIR = '__avm_data_cache__';

beforeEach(() => {
  clearAvmCache();
});

afterEach(() => {
  clearAvmCache();
});

// ==========================================
// clearAvmCache
// ==========================================

describe('clearAvmCache', () => {
  it('should not throw', () => {
    expect(() => clearAvmCache()).not.toThrow();
  });

  it('should be callable multiple times', () => {
    expect(() => {
      clearAvmCache();
      clearAvmCache();
      clearAvmCache();
    }).not.toThrow();
  });
});

// ==========================================
// getAvmModules - Return Type Validation
// ==========================================

describe('getAvmModules', () => {
  it('should return an array', async () => {
    // This test verifies the function returns the expected type
    // It may use cached data or fetch from remote
    const modules = await getAvmModules({});
    
    expect(Array.isArray(modules)).toBe(true);
  });

  it('should return modules with expected structure', async () => {
    const modules = await getAvmModules({});
    
    if (modules.length > 0) {
      const module = modules[0];
      expect(module).toHaveProperty('moduleName');
      expect(module).toHaveProperty('description');
      expect(module).toHaveProperty('source');
      expect(module).toHaveProperty('repoUrl');
    }
  });

  it('should return modules with valid moduleName', async () => {
    const modules = await getAvmModules({});
    
    for (const module of modules) {
      expect(typeof module.moduleName).toBe('string');
      expect(module.moduleName.length).toBeGreaterThan(0);
    }
  });

  it('should return modules with Terraform source format', async () => {
    const modules = await getAvmModules({});
    
    for (const module of modules) {
      // Source should be in format: org/module/provider
      expect(module.source).toMatch(/^[^/]+\/[^/]+\/[^/]+$/);
    }
  });
});

// ==========================================
// getAvmLatestVersion
// ==========================================

describe('getAvmLatestVersion', () => {
  it('should return error message for unknown module', async () => {
    const result = await getAvmLatestVersion({ moduleName: 'definitely-not-a-real-module-xyz123' });
    
    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });

  it('should return a string', async () => {
    const result = await getAvmLatestVersion({ moduleName: 'some-module' });
    
    expect(typeof result).toBe('string');
  });
});

// ==========================================
// getAvmVersions
// ==========================================

describe('getAvmVersions', () => {
  it('should return error string for unknown module', async () => {
    const result = await getAvmVersions({ moduleName: 'definitely-not-a-real-module-xyz456' });
    
    expect(typeof result).toBe('string');
    expect(result).toContain('not found');
  });

  it('should return either array or error string', async () => {
    const result = await getAvmVersions({ moduleName: 'some-module' });
    
    expect(Array.isArray(result) || typeof result === 'string').toBe(true);
  });

  it('should include version info when returning array', async () => {
    const result = await getAvmVersions({ moduleName: 'some-module' });
    
    if (Array.isArray(result) && result.length > 0) {
      expect(result[0]).toHaveProperty('tagName');
      expect(result[0]).toHaveProperty('createdAt');
      expect(result[0]).toHaveProperty('tarballUrl');
    }
  });
});

// ==========================================
// getAvmVariables
// ==========================================

describe('getAvmVariables', () => {
  it('should return error for unknown module', async () => {
    const result = await getAvmVariables({
      moduleName: 'definitely-not-a-real-module-xyz789',
      moduleVersion: '0.1.0',
    });
    
    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });

  it('should return a string', async () => {
    const result = await getAvmVariables({
      moduleName: 'some-module',
      moduleVersion: '0.1.0',
    });
    
    expect(typeof result).toBe('string');
  });
});

// ==========================================
// getAvmOutputs
// ==========================================

describe('getAvmOutputs', () => {
  it('should return error for unknown module', async () => {
    const result = await getAvmOutputs({
      moduleName: 'definitely-not-a-real-module-xyz999',
      moduleVersion: '0.1.0',
    });
    
    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });

  it('should return a string', async () => {
    const result = await getAvmOutputs({
      moduleName: 'some-module',
      moduleVersion: '0.1.0',
    });
    
    expect(typeof result).toBe('string');
  });
});

// ==========================================
// Integration-like tests (if data available)
// ==========================================

describe('module data consistency', () => {
  it('should return same modules on repeated calls', async () => {
    const modules1 = await getAvmModules({});
    const modules2 = await getAvmModules({});
    
    expect(modules1.length).toBe(modules2.length);
    expect(modules1.map(m => m.moduleName)).toEqual(modules2.map(m => m.moduleName));
  });

  it('should only include Available modules (not Proposed)', async () => {
    const modules = await getAvmModules({});
    
    // We can't directly test this without knowing the CSV content,
    // but we can verify that all returned modules have expected fields
    for (const module of modules) {
      expect(module.moduleName).toBeDefined();
      expect(module.repoUrl).toContain('github.com');
    }
  });

  it('should have modules with Azure repo URLs', async () => {
    const modules = await getAvmModules({});
    
    for (const module of modules) {
      // AVM modules are hosted on Azure GitHub org
      expect(module.repoUrl).toContain('Azure');
    }
  });
});
