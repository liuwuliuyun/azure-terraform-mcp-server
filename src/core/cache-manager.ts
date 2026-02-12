/**
 * Unified cache management for Azure Terraform MCP Server.
 *
 * Provides a centralized cache directory structure for:
 * - AzAPI schema definitions
 * - AVM module data and documentation
 * - Conftest policy libraries
 * - Temporary installation artifacts
 *
 * Cache Structure:
 * ~/.azure-terraform-mcp/
 * ├── azapi-schemas/         # AzAPI resource schemas
 * ├── avm-data/              # AVM module metadata and documentation
 * ├── conftest-policies/     # Downloaded policy libraries
 * └── temp/                  # Temporary files (auto-cleaned)
 */

import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ==========================================
// Constants
// ==========================================

const CACHE_ROOT_DIR_NAME = '.azure-terraform-mcp';
const CACHE_SUBDIRS = {
  azapi: 'azapi-schemas',
  avm: 'avm-data',
  conftest: 'conftest-policies',
  temp: 'temp',
} as const;

const TEMP_FILE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ==========================================
// Types
// ==========================================

export type CacheType = 'azapi' | 'avm' | 'conftest' | 'temp';

export interface CacheStatus {
  rootPath: string;
  exists: boolean;
  subdirectories: Record<CacheType, { path: string; exists: boolean; size?: number }>;
  totalSize: number;
}

export interface CacheEntry {
  path: string;
  createdAt: Date;
  size: number;
}

// ==========================================
// Cache Manager
// ==========================================

let cachedRootPath: string | null = null;

/**
 * Get the root cache directory path.
 * Creates it if it doesn't exist.
 */
export function getCacheRootPath(): string {
  if (cachedRootPath && existsSync(cachedRootPath)) {
    return cachedRootPath;
  }

  const rootPath = join(homedir(), CACHE_ROOT_DIR_NAME);

  if (!existsSync(rootPath)) {
    mkdirSync(rootPath, { recursive: true });
  }

  cachedRootPath = rootPath;
  return rootPath;
}

/**
 * Get the path for a specific cache type.
 * Creates the directory if it doesn't exist.
 */
export function getCachePath(type: CacheType): string {
  const rootPath = getCacheRootPath();
  const subdir = CACHE_SUBDIRS[type];
  const cachePath = join(rootPath, subdir);

  if (!existsSync(cachePath)) {
    mkdirSync(cachePath, { recursive: true });
  }

  return cachePath;
}

/**
 * Get the full path for a cached file.
 * Does not create the file or parent directories.
 */
export function getCacheFilePath(type: CacheType, filename: string): string {
  const cachePath = getCachePath(type);
  return join(cachePath, filename);
}

/**
 * Get cache status including existence and size information.
 */
export function getCacheStatus(): CacheStatus {
  const rootPath = getCacheRootPath();
  const subdirectories: Record<string, { path: string; exists: boolean; size?: number }> = {};
  let totalSize = 0;

  for (const [key, subdir] of Object.entries(CACHE_SUBDIRS)) {
    const path = join(rootPath, subdir);
    const exists = existsSync(path);
    let size = 0;

    if (exists) {
      try {
        size = calculateDirSize(path);
        totalSize += size;
      } catch {
        // Ignore size calculation errors
      }
    }

    subdirectories[key] = {
      path,
      exists,
      ...(exists && size > 0 && { size }),
    };
  }

  return {
    rootPath,
    exists: existsSync(rootPath),
    subdirectories: subdirectories as Record<CacheType, any>,
    totalSize,
  };
}

/**
 * Clear a specific cache type.
 */
export function clearCache(type: CacheType): boolean {
  try {
    const cachePath = getCachePath(type);
    if (existsSync(cachePath)) {
      rmSync(cachePath, { recursive: true, force: true });
      mkdirSync(cachePath, { recursive: true });
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to clear ${type} cache:`, error);
    return false;
  }
}

/**
 * Clear all caches.
 */
export function clearAllCaches(): boolean {
  try {
    const rootPath = getCacheRootPath();
    if (existsSync(rootPath)) {
      rmSync(rootPath, { recursive: true, force: true });
      mkdirSync(rootPath, { recursive: true });
      cachedRootPath = rootPath;
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to clear all caches:', error);
    return false;
  }
}

/**
 * Clean up expired temporary files.
 * Removes temp files older than TEMP_FILE_EXPIRATION_MS.
 */
export function cleanExpiredTempFiles(): number {
  const tempPath = getCachePath('temp');
  let cleanedCount = 0;

  if (!existsSync(tempPath)) {
    return 0;
  }

  try {
    const files = require('node:fs').readdirSync(tempPath);
    const now = Date.now();

    for (const file of files) {
      const filePath = join(tempPath, file);
      try {
        const stat = statSync(filePath);
        const age = now - stat.mtime.getTime();

        if (age > TEMP_FILE_EXPIRATION_MS) {
          rmSync(filePath, { recursive: true, force: true });
          cleanedCount++;
        }
      } catch {
        // Ignore errors for individual files
      }
    }
  } catch (error) {
    console.error('Failed to clean expired temp files:', error);
  }

  return cleanedCount;
}

/**
 * Reset the cached root path (useful for testing).
 */
export function resetCacheManager(): void {
  cachedRootPath = null;
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Calculate total size of a directory in bytes.
 */
function calculateDirSize(dirPath: string): number {
  if (!existsSync(dirPath)) {
    return 0;
  }

  let size = 0;

  try {
    const files = require('node:fs').readdirSync(dirPath);

    for (const file of files) {
      const filePath = join(dirPath, file);
      const stat = statSync(filePath);

      if (stat.isDirectory()) {
        size += calculateDirSize(filePath);
      } else {
        size += stat.size;
      }
    }
  } catch {
    // Ignore errors in size calculation
  }

  return size;
}

/**
 * Format bytes as human-readable size.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
