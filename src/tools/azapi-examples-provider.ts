/**
 * AzAPI Examples Provider
 *
 * Fetches Terraform examples from the Azure template-reference-generator repository.
 * Each provider namespace (e.g., microsoft.compute) has a remarks.json file that
 * indexes available samples, and actual .tf files are stored in samples/ subdirectories.
 *
 * Repository: https://github.com/Azure/template-reference-generator/tree/main/settings/remarks
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getCachePath } from '../core/cache-manager.js';
import type {
  AzApiTerraformSample,
  AzApiRemarksIndex,
  AzApiExample,
} from '../core/types.js';

// ==========================================
// Constants
// ==========================================

const GITHUB_OWNER = 'Azure';
const GITHUB_REPO = 'template-reference-generator';
const GITHUB_BRANCH = 'main';
const REMARKS_PATH = 'settings/remarks';

/** Cache expiry duration in milliseconds (7 days) */
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/** GitHub API base URL */
const GITHUB_API_BASE = 'https://api.github.com';

/** GitHub raw content base URL */
const RAW_CONTENT_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}`;

// ==========================================
// Types
// ==========================================

interface GitHubContentItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url?: string;
}

interface RemarksJsonSchema {
  $schema?: string;
  TerraformSamples?: Array<{
    ResourceType: string;
    Path: string;
    Description: string;
  }>;
  BicepSamples?: Array<{
    ResourceType: string;
    Path: string;
    Description: string;
  }>;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// ==========================================
// Cache Management
// ==========================================

const EXAMPLES_CACHE_DIR = 'azapi-examples';

function getExamplesCachePath(): string {
  const basePath = getCachePath('azapi');
  const examplesPath = join(basePath, EXAMPLES_CACHE_DIR);

  if (!existsSync(examplesPath)) {
    mkdirSync(examplesPath, { recursive: true });
  }

  return examplesPath;
}

function getCacheFilePath(key: string): string {
  const cachePath = getExamplesCachePath();
  // Sanitize the key for filesystem
  const safeKey = key.replace(/[/\\:*?"<>|]/g, '_').toLowerCase();
  return join(cachePath, `${safeKey}.json`);
}

function readFromCache<T>(key: string): T | null {
  const filePath = getCacheFilePath(key);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const entry = JSON.parse(content) as CacheEntry<T>;

    // Check if cache is expired
    if (Date.now() - entry.timestamp > CACHE_EXPIRY_MS) {
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

function writeToCache<T>(key: string, data: T): void {
  const filePath = getCacheFilePath(key);
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
  };

  try {
    writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to write cache for ${key}:`, error);
  }
}

// ==========================================
// GitHub API Helpers
// ==========================================

function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Azure-Terraform-MCP-Server',
    Accept: 'application/vnd.github.v3+json',
  };

  const githubToken = process.env['GITHUB_TOKEN'];
  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }

  return headers;
}

// ==========================================
// Main Functions
// ==========================================

/**
 * List all available namespaces in the remarks folder.
 * Returns namespace names like ['microsoft.compute', 'microsoft.storage', ...]
 */
export async function listAvailableNamespaces(): Promise<string[]> {
  const cacheKey = 'namespaces_list';
  const cached = readFromCache<string[]>(cacheKey);

  if (cached) {
    return cached;
  }

  const apiUrl = `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${REMARKS_PATH}`;

  try {
    const response = await fetch(apiUrl, { headers: getGitHubHeaders() });

    if (!response.ok) {
      console.error(`Failed to list namespaces: ${response.status} ${response.statusText}`);
      return [];
    }

    const contents = (await response.json()) as GitHubContentItem[];
    const namespaces = contents
      .filter((item) => item.type === 'dir')
      .map((item) => item.name.toLowerCase())
      .sort();

    writeToCache(cacheKey, namespaces);
    return namespaces;
  } catch (error) {
    console.error('Failed to list namespaces:', error);
    return [];
  }
}

/**
 * Fetch the remarks.json index for a specific namespace.
 * Returns null if not found or on error.
 */
export async function fetchRemarksIndex(
  namespace: string
): Promise<AzApiRemarksIndex | null> {
  const normalizedNamespace = namespace.toLowerCase();
  const cacheKey = `remarks_${normalizedNamespace}`;
  const cached = readFromCache<AzApiRemarksIndex>(cacheKey);

  if (cached) {
    return cached;
  }

  const remarksUrl = `${RAW_CONTENT_BASE}/${REMARKS_PATH}/${normalizedNamespace}/remarks.json`;

  try {
    const response = await fetch(remarksUrl, { headers: getGitHubHeaders() });

    if (!response.ok) {
      if (response.status === 404) {
        console.error(`No remarks.json found for namespace: ${namespace}`);
      } else {
        console.error(`Failed to fetch remarks.json: ${response.status} ${response.statusText}`);
      }
      return null;
    }

    const remarksData = (await response.json()) as RemarksJsonSchema;

    const index: AzApiRemarksIndex = {
      namespace: normalizedNamespace,
      terraformSamples: (remarksData.TerraformSamples ?? []).map((sample) => ({
        resourceType: sample.ResourceType,
        path: sample.Path,
        description: sample.Description,
      })),
    };

    writeToCache(cacheKey, index);
    return index;
  } catch (error) {
    console.error(`Failed to fetch remarks index for ${namespace}:`, error);
    return null;
  }
}

/**
 * Fetch the actual Terraform example file content.
 */
export async function fetchExampleContent(
  namespace: string,
  samplePath: string
): Promise<string | null> {
  const normalizedNamespace = namespace.toLowerCase();
  const cacheKey = `example_${normalizedNamespace}_${samplePath}`;
  const cached = readFromCache<string>(cacheKey);

  if (cached) {
    return cached;
  }

  const contentUrl = `${RAW_CONTENT_BASE}/${REMARKS_PATH}/${normalizedNamespace}/${samplePath}`;

  try {
    const response = await fetch(contentUrl, {
      headers: {
        ...getGitHubHeaders(),
        Accept: 'text/plain',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch example content: ${response.status} ${response.statusText}`);
      return null;
    }

    const content = await response.text();
    writeToCache(cacheKey, content);
    return content;
  } catch (error) {
    console.error(`Failed to fetch example content from ${contentUrl}:`, error);
    return null;
  }
}

/**
 * Get all Terraform examples for a specific Azure resource type.
 * This is the main entry point for fetching examples.
 *
 * @param resourceType - Azure resource type (e.g., 'Microsoft.Compute/virtualMachines')
 * @returns Array of examples with content, or empty array if none found
 */
export async function getExamplesForResourceType(
  resourceType: string
): Promise<AzApiExample[]> {
  // Extract namespace from resource type (e.g., 'Microsoft.Compute' from 'Microsoft.Compute/virtualMachines')
  const parts = resourceType.split('/');
  if (parts.length < 2 || !parts[0]) {
    console.error(`Invalid resource type format: ${resourceType}`);
    return [];
  }

  const namespace = parts[0].toLowerCase();

  // Fetch the remarks index for this namespace
  const remarksIndex = await fetchRemarksIndex(namespace);
  if (!remarksIndex) {
    return [];
  }

  // Find samples matching this resource type and deduplicate by path
  const matchingSamples = remarksIndex.terraformSamples.filter((sample) =>
    sample.resourceType.toLowerCase() === resourceType.toLowerCase()
  );

  const seenPaths = new Set<string>();
  const uniqueSamples = matchingSamples.filter((sample) => {
    const key = sample.path.toLowerCase();
    if (seenPaths.has(key)) {
      return false;
    }
    seenPaths.add(key);
    return true;
  });

  if (uniqueSamples.length === 0) {
    return [];
  }

  // Fetch content for each unique matching sample
  const examples: AzApiExample[] = [];

  for (const sample of uniqueSamples) {
    const content = await fetchExampleContent(namespace, sample.path);
    if (content) {
      examples.push({
        description: sample.description,
        content,
        sourcePath: `${REMARKS_PATH}/${namespace}/${sample.path}`,
      });
    }
  }

  return examples;
}

/**
 * Get all available samples for a namespace without fetching content.
 * Useful for listing what's available.
 */
export async function listSamplesForNamespace(
  namespace: string
): Promise<AzApiTerraformSample[]> {
  const remarksIndex = await fetchRemarksIndex(namespace);
  return remarksIndex?.terraformSamples ?? [];
}

/**
 * Search for examples across all namespaces matching a resource type pattern.
 * Useful for partial matches or wildcard searches.
 *
 * @param pattern - Pattern to match against resource types (case-insensitive)
 * @param maxResults - Maximum number of results to return (default: 10)
 */
export async function searchExamples(
  pattern: string,
  maxResults: number = 10
): Promise<Array<{ namespace: string; sample: AzApiTerraformSample }>> {
  const patternLower = pattern.toLowerCase();
  const results: Array<{ namespace: string; sample: AzApiTerraformSample }> = [];

  // Get all namespaces
  const namespaces = await listAvailableNamespaces();

  // Filter namespaces that might contain matching resources
  // If pattern contains a provider prefix, only check that namespace
  const targetNamespaces = namespaces.filter((ns) => {
    if (patternLower.includes('.')) {
      const patternPrefix = patternLower.split('.')[0] + '.' + patternLower.split('.')[1]?.split('/')[0];
      return ns === patternPrefix?.toLowerCase();
    }
    return true;
  });

  for (const namespace of targetNamespaces) {
    if (results.length >= maxResults) {
      break;
    }

    const remarksIndex = await fetchRemarksIndex(namespace);
    if (!remarksIndex) {
      continue;
    }

    for (const sample of remarksIndex.terraformSamples) {
      if (results.length >= maxResults) {
        break;
      }

      if (sample.resourceType.toLowerCase().includes(patternLower)) {
        results.push({ namespace, sample });
      }
    }
  }

  return results;
}

/**
 * Clear all cached examples data.
 */
export function clearExamplesCache(): void {
  const cachePath = getExamplesCachePath();
  if (existsSync(cachePath)) {
    rmSync(cachePath, { recursive: true, force: true });
    mkdirSync(cachePath, { recursive: true });
  }
}
