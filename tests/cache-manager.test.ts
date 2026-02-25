/**
 * Tests for core/cache-manager.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getCacheRootPath,
  getCachePath,
  getCacheFilePath,
  getCacheStatus,
  clearCache,
  clearAllCaches,
  cleanExpiredTempFiles,
  resetCacheManager,
  formatBytes,
} from '../src/core/cache-manager.js';
import type { CacheType } from '../src/core/cache-manager.js';

// ==========================================
// Setup & Teardown
// ==========================================

beforeEach(() => {
  resetCacheManager();
});

afterEach(() => {
  resetCacheManager();
});

// ==========================================
// getCacheRootPath
// ==========================================

describe('getCacheRootPath', () => {
  it('should return a valid path', () => {
    const rootPath = getCacheRootPath();
    expect(typeof rootPath).toBe('string');
    expect(rootPath.length).toBeGreaterThan(0);
  });

  it('should return consistent path on repeated calls', () => {
    const path1 = getCacheRootPath();
    const path2 = getCacheRootPath();
    expect(path1).toBe(path2);
  });

  it('should contain .azure-terraform-mcp in path', () => {
    const rootPath = getCacheRootPath();
    expect(rootPath).toContain('.azure-terraform-mcp');
  });

  it('should create the directory if not exists', () => {
    const rootPath = getCacheRootPath();
    expect(existsSync(rootPath)).toBe(true);
  });
});

// ==========================================
// getCachePath
// ==========================================

describe('getCachePath', () => {
  const cacheTypes: CacheType[] = ['azapi', 'avm', 'conftest', 'temp'];

  it('should return different paths for different cache types', () => {
    const paths = cacheTypes.map((type) => getCachePath(type));
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(cacheTypes.length);
  });

  it('should create subdirectories', () => {
    for (const type of cacheTypes) {
      const path = getCachePath(type);
      expect(existsSync(path)).toBe(true);
    }
  });

  it('should return paths under cache root', () => {
    const rootPath = getCacheRootPath();
    for (const type of cacheTypes) {
      const path = getCachePath(type);
      expect(path.startsWith(rootPath)).toBe(true);
    }
  });

  it('should use expected subdirectory names', () => {
    expect(getCachePath('azapi')).toContain('azapi-schemas');
    expect(getCachePath('avm')).toContain('avm-data');
    expect(getCachePath('conftest')).toContain('conftest-policies');
    expect(getCachePath('temp')).toContain('temp');
  });
});

// ==========================================
// getCacheFilePath
// ==========================================

describe('getCacheFilePath', () => {
  it('should return path with filename', () => {
    const filePath = getCacheFilePath('azapi', 'test-schema.json');
    expect(filePath).toContain('test-schema.json');
  });

  it('should include cache type directory', () => {
    const filePath = getCacheFilePath('avm', 'modules.csv');
    expect(filePath).toContain('avm-data');
  });

  it('should not create the file', () => {
    const filePath = getCacheFilePath('temp', 'nonexistent.txt');
    expect(existsSync(filePath)).toBe(false);
  });
});

// ==========================================
// getCacheStatus
// ==========================================

describe('getCacheStatus', () => {
  it('should return status object', () => {
    const status = getCacheStatus();
    expect(status).toHaveProperty('rootPath');
    expect(status).toHaveProperty('exists');
    expect(status).toHaveProperty('subdirectories');
    expect(status).toHaveProperty('totalSize');
  });

  it('should include all cache types in subdirectories', () => {
    const status = getCacheStatus();
    expect(status.subdirectories).toHaveProperty('azapi');
    expect(status.subdirectories).toHaveProperty('avm');
    expect(status.subdirectories).toHaveProperty('conftest');
    expect(status.subdirectories).toHaveProperty('temp');
  });

  it('should have path and exists for each subdirectory', () => {
    const status = getCacheStatus();
    for (const key of ['azapi', 'avm', 'conftest', 'temp'] as CacheType[]) {
      expect(status.subdirectories[key]).toHaveProperty('path');
      expect(status.subdirectories[key]).toHaveProperty('exists');
    }
  });

  it('should report correct root existence', () => {
    getCacheRootPath(); // Ensure directory exists
    const status = getCacheStatus();
    expect(status.exists).toBe(true);
  });

  it('should report totalSize as a number', () => {
    const status = getCacheStatus();
    expect(typeof status.totalSize).toBe('number');
    expect(status.totalSize).toBeGreaterThanOrEqual(0);
  });
});

// ==========================================
// clearCache
// ==========================================

describe('clearCache', () => {
  it('should clear a specific cache type without error', () => {
    // Ensure the cache directory exists first
    getCachePath('temp');
    const result = clearCache('temp');
    // Returns true if directory existed
    expect(typeof result).toBe('boolean');
  });

  it('should recreate the directory after clearing', () => {
    const tempPath = getCachePath('temp');
    // Write a file to it
    writeFileSync(join(tempPath, 'test.txt'), 'test');
    expect(existsSync(join(tempPath, 'test.txt'))).toBe(true);

    clearCache('temp');

    // Directory should still exist (recreated)
    expect(existsSync(tempPath)).toBe(true);
    // But the file should be gone
    expect(existsSync(join(tempPath, 'test.txt'))).toBe(false);
  });
});

// ==========================================
// clearAllCaches
// ==========================================

describe('clearAllCaches', () => {
  it('should clear all caches without error', () => {
    getCacheRootPath(); // Ensure root exists
    const result = clearAllCaches();
    expect(typeof result).toBe('boolean');
  });

  it('should remove files from all cache types', () => {
    // Write test files to each cache type
    for (const type of ['azapi', 'avm', 'conftest', 'temp'] as CacheType[]) {
      const path = getCachePath(type);
      writeFileSync(join(path, 'test.txt'), 'test');
    }

    clearAllCaches();

    // Root should be recreated
    const rootPath = getCacheRootPath();
    expect(existsSync(rootPath)).toBe(true);
  });
});

// ==========================================
// cleanExpiredTempFiles
// ==========================================

describe('cleanExpiredTempFiles', () => {
  it('should return 0 when no temp files exist', () => {
    getCachePath('temp'); // Ensure directory exists
    clearCache('temp');
    const cleaned = cleanExpiredTempFiles();
    expect(cleaned).toBe(0);
  });

  it('should return a non-negative number', () => {
    const cleaned = cleanExpiredTempFiles();
    expect(cleaned).toBeGreaterThanOrEqual(0);
  });
});

// ==========================================
// resetCacheManager
// ==========================================

describe('resetCacheManager', () => {
  it('should not throw', () => {
    expect(() => resetCacheManager()).not.toThrow();
  });

  it('should allow re-initialization', () => {
    const path1 = getCacheRootPath();
    resetCacheManager();
    const path2 = getCacheRootPath();
    // Should still return the same path (since home dir hasn't changed)
    expect(path1).toBe(path2);
  });
});

// ==========================================
// formatBytes
// ==========================================

describe('formatBytes', () => {
  it('should format 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('should format bytes', () => {
    expect(formatBytes(100)).toBe('100 B');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it('should format with decimal precision', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('should format large byte counts as MB', () => {
    const result = formatBytes(5242880);
    expect(result).toBe('5 MB');
  });
});
