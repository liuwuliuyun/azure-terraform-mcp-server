/**
 * AVM (Azure Verified Modules) documentation provider for Azure Terraform MCP Server.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { extract } from 'tar';
import type {
  AvmModule,
  AvmVersion,
  GetAvmModulesParamsType,
  GetAvmLatestVersionParamsType,
  GetAvmVersionsParamsType,
  GetAvmVariablesParamsType,
  GetAvmOutputsParamsType,
} from '../core/types.js';
import { getGitHubToken } from '../core/config.js';

// ==========================================
// Constants
// ==========================================

const AVAILABLE_MODULES_URL =
  'https://raw.githubusercontent.com/Azure/Azure-Verified-Modules/main/docs/static/module-indexes/TerraformResourceModules.csv';
const LOCAL_DATA_BASE_PATH = '__avm_data_cache__';
const AVAILABLE_MODULE_FILE = 'available_modules.csv';
const CACHE_EXPIRATION_MS = 86400 * 1000; // 24 hours

// Module CSV columns
const MODULE_NAME_COLUMN = 'ModuleName';
const DESCRIPTION_COLUMN = 'Description';
const MODULE_STATUS_COLUMN = 'ModuleStatus';
const MODULE_STATUS_PROPOSED = 'Proposed';
const MODULE_REPO_URL_COLUMN = 'RepoURL';

// ==========================================
// Types
// ==========================================

interface ModuleInfo {
  name: string;
  description: string;
  source: string;
  repoUrl: string;
  versions?: Record<string, VersionInfo>;
}

interface VersionInfo {
  tagName: string;
  createdAt: string;
  tarballUrl: string;
}

// ==========================================
// Cache Management
// ==========================================

let cachedModules: Record<string, ModuleInfo> | null = null;

function ensureCacheDir(): void {
  if (!existsSync(LOCAL_DATA_BASE_PATH)) {
    mkdirSync(LOCAL_DATA_BASE_PATH, { recursive: true });
  }
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Azure-Terraform-MCP-Server',
  };

  const githubToken = getGitHubToken();
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  return headers;
}

// ==========================================
// Helper Functions
// ==========================================

function sourceFromRepoUrl(repoUrl: string): string {
  // Split https://github.com/Azure/terraform-azurerm-avm-res-apimanagement-service
  const parts = repoUrl.split('/');
  const githubOrg = parts[parts.length - 2] ?? 'Azure';
  const moduleRepoName = parts[parts.length - 1] ?? '';

  // Split module name terraform-azurerm-avm-res-apimanagement-service
  const nameParts = moduleRepoName.split('-');
  const moduleOrg = nameParts[1] ?? 'azurerm';
  const moduleName = nameParts.slice(2).join('-');

  // Return format: "Azure/avm-res-apimanagement-service/azurerm"
  return `${githubOrg}/${moduleName}/${moduleOrg}`;
}

function parseCSV(csvContent: string): Array<Record<string, string>> {
  const lines = csvContent.trim().split('\n');
  if (lines.length === 0) {return [];}

  const headerLine = lines[0];
  if (!headerLine) {return [];}

  const headers = headerLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {continue;}

    // Simple CSV parsing (handles basic cases)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    rows.push(row);
  }

  return rows;
}

// ==========================================
// Module Collection
// ==========================================

async function getModuleCollection(): Promise<Record<string, ModuleInfo>> {
  if (cachedModules) {
    return cachedModules;
  }

  ensureCacheDir();
  const moduleFilePath = join(LOCAL_DATA_BASE_PATH, AVAILABLE_MODULE_FILE);

  let csvContent: string;

  // Check if cache is valid
  if (existsSync(moduleFilePath)) {
    const stats = statSync(moduleFilePath);
    const age = Date.now() - stats.mtimeMs;

    if (age < CACHE_EXPIRATION_MS) {
      csvContent = readFileSync(moduleFilePath, 'utf-8');
    } else {
      csvContent = await fetchModulesFromRemote(moduleFilePath);
    }
  } else {
    csvContent = await fetchModulesFromRemote(moduleFilePath);
  }

  const rows = parseCSV(csvContent);
  const modules: Record<string, ModuleInfo> = {};

  for (const row of rows) {
    const status = row[MODULE_STATUS_COLUMN];
    if (status === MODULE_STATUS_PROPOSED) {
      continue;
    }

    const moduleName = row[MODULE_NAME_COLUMN] ?? '';
    const repoUrl = row[MODULE_REPO_URL_COLUMN] ?? '';

    if (!moduleName || !repoUrl) {continue;}

    modules[moduleName] = {
      name: moduleName,
      description: row[DESCRIPTION_COLUMN] ?? '',
      repoUrl: repoUrl,
      source: sourceFromRepoUrl(repoUrl),
    };
  }

  cachedModules = modules;
  return modules;
}

async function fetchModulesFromRemote(cacheFilePath: string): Promise<string> {
  const response = await fetch(AVAILABLE_MODULES_URL, {
    headers: { 'User-Agent': 'Azure-Terraform-MCP-Server' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch modules: HTTP ${response.status}`);
  }

  const csvContent = await response.text();

  // Save to cache
  try {
    writeFileSync(cacheFilePath, csvContent, 'utf-8');
  } catch {
    // Ignore cache write errors
  }

  return csvContent;
}

// ==========================================
// Version Management
// ==========================================

async function retrieveVersionInfo(moduleName: string): Promise<Record<string, VersionInfo>> {
  const modules = await getModuleCollection();
  const moduleInfo = modules[moduleName];

  if (!moduleInfo) {
    throw new Error(`Module ${moduleName} not found in available modules.`);
  }

  // Convert repo URL to API URL
  const apiUrl = moduleInfo.repoUrl.replace('github.com', 'api.github.com/repos') + '/releases';

  const response = await fetch(apiUrl, { headers: getHeaders() });

  if (!response.ok) {
    throw new Error(`Failed to fetch versions for ${moduleName}: HTTP ${response.status}`);
  }

  const releases = (await response.json()) as Array<{
    tag_name: string;
    created_at: string;
    tarball_url: string;
  }>;

  const versions: Record<string, VersionInfo> = {};

  for (const release of releases) {
    const tagName = release.tag_name.replace(/^v/, '');
    versions[tagName] = {
      tagName,
      createdAt: release.created_at,
      tarballUrl: release.tarball_url,
    };
  }

  // Update cached module info
  moduleInfo.versions = versions;

  return versions;
}

async function getVersionList(moduleName: string): Promise<string[]> {
  const modules = await getModuleCollection();
  const moduleInfo = modules[moduleName];

  if (!moduleInfo) {
    throw new Error(`Module ${moduleName} not found in available modules.`);
  }

  if (!moduleInfo.versions) {
    await retrieveVersionInfo(moduleName);
  }

  const versions = Object.values(moduleInfo.versions ?? {});
  versions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return versions.map((v) => v.tagName);
}

async function downloadModuleVersion(tarballUrl: string, targetPath: string): Promise<void> {
  const response = await fetch(tarballUrl, {
    headers: getHeaders(),
    redirect: 'follow',
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download module: HTTP ${response.status}`);
  }

  ensureCacheDir();
  mkdirSync(targetPath, { recursive: true });

  const tempFile = join(targetPath, `temp-${Date.now()}.tar.gz`);

  try {
    // Download tarball
    const fileStream = createWriteStream(tempFile);
    const body = response.body;
    if (!body) {
      throw new Error('No response body');
    }
    await pipeline(Readable.fromWeb(body as import('stream/web').ReadableStream), fileStream);

    // Extract tarball
    await extract({
      file: tempFile,
      cwd: targetPath,
    });

    // Reorganize directory structure (GitHub tarballs have a wrapper directory)
    const entries = readdirSync(targetPath).filter((e) => e !== `temp-${Date.now()}.tar.gz`);
    if (entries.length === 1) {
      const wrapperDir = join(targetPath, entries[0] ?? '');
      if (existsSync(wrapperDir) && statSync(wrapperDir).isDirectory()) {
        const innerEntries = readdirSync(wrapperDir);
        for (const entry of innerEntries) {
          renameSync(join(wrapperDir, entry), join(targetPath, entry));
        }
        rmSync(wrapperDir, { recursive: true });
      }
    }
  } finally {
    // Clean up temp file
    if (existsSync(tempFile)) {
      rmSync(tempFile);
    }
  }
}

async function getVersionPath(moduleName: string, version: string): Promise<string> {
  const modules = await getModuleCollection();
  const moduleInfo = modules[moduleName];

  if (!moduleInfo) {
    throw new Error(`Module ${moduleName} not found in available modules.`);
  }

  if (!moduleInfo.versions) {
    await retrieveVersionInfo(moduleName);
  }

  const cleanVersion = version.replace(/^v/, '');
  const versionInfo = moduleInfo.versions?.[cleanVersion];

  if (!versionInfo) {
    const availableVersions = await getVersionList(moduleName);
    throw new Error(
      `Version ${version} not found for module ${moduleName}. Available versions: ${availableVersions.join(', ')}`
    );
  }

  const versionPath = join(LOCAL_DATA_BASE_PATH, moduleName, cleanVersion);

  if (!existsSync(versionPath)) {
    await downloadModuleVersion(versionInfo.tarballUrl, versionPath);
  }

  return versionPath;
}

// ==========================================
// Public API Functions
// ==========================================

/**
 * Get all available Azure Verified Modules.
 */
export async function getAvmModules(
  _params: GetAvmModulesParamsType
): Promise<AvmModule[]> {
  const modules = await getModuleCollection();

  return Object.values(modules).map((mod) => ({
    moduleName: mod.name,
    description: mod.description,
    source: mod.source,
    repoUrl: mod.repoUrl,
  }));
}

/**
 * Get the latest version of a specific Azure Verified Module.
 */
export async function getAvmLatestVersion(
  params: GetAvmLatestVersionParamsType
): Promise<string> {
  const { moduleName } = params;

  try {
    const versions = await getVersionList(moduleName);
    if (versions.length === 0) {
      return `No version found for module: ${moduleName}`;
    }
    return versions[0] ?? 'Unknown';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }
}

/**
 * Get all available versions of a specific Azure Verified Module.
 */
export async function getAvmVersions(
  params: GetAvmVersionsParamsType
): Promise<AvmVersion[] | string> {
  const { moduleName } = params;

  try {
    const modules = await getModuleCollection();
    const moduleInfo = modules[moduleName];

    if (!moduleInfo) {
      return `Module ${moduleName} not found in available modules.`;
    }

    if (!moduleInfo.versions) {
      await retrieveVersionInfo(moduleName);
    }

    const versions = Object.values(moduleInfo.versions ?? {});
    versions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return versions.map((v) => ({
      tagName: v.tagName,
      createdAt: v.createdAt,
      tarballUrl: v.tarballUrl,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }
}

/**
 * Get the input variables schema for a specific AVM module version.
 */
export async function getAvmVariables(
  params: GetAvmVariablesParamsType
): Promise<string> {
  const { moduleName, moduleVersion } = params;

  try {
    const basePath = await getVersionPath(moduleName, moduleVersion);
    const files = readdirSync(basePath);
    const variableFiles = files.filter((f) => f.endsWith('.tf') && f.startsWith('variable'));

    let result = '';
    for (const variableFile of variableFiles) {
      const filePath = join(basePath, variableFile);
      result += readFileSync(filePath, 'utf-8') + '\n';
    }

    return result || `No variable files found for module ${moduleName} version ${moduleVersion}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }
}

/**
 * Get the output definitions for a specific AVM module version.
 */
export async function getAvmOutputs(
  params: GetAvmOutputsParamsType
): Promise<string> {
  const { moduleName, moduleVersion } = params;

  try {
    const basePath = await getVersionPath(moduleName, moduleVersion);
    const files = readdirSync(basePath);
    const outputFiles = files.filter((f) => f.endsWith('.tf') && f.startsWith('output'));

    let result = '';
    for (const outputFile of outputFiles) {
      const filePath = join(basePath, outputFile);
      result += readFileSync(filePath, 'utf-8') + '\n';
    }

    return result || `No output files found for module ${moduleName} version ${moduleVersion}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }
}

/**
 * Clear the module cache (useful for testing).
 */
export function clearAvmCache(): void {
  cachedModules = null;
}
