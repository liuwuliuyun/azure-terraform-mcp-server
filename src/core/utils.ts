/**
 * Utility functions for Azure Terraform MCP Server
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, join, isAbsolute } from 'node:path';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import type { CommandResult } from './types.js';

// ==========================================
// ANSI Escape Sequence Handling
// ==========================================

/**
 * Remove ANSI escape sequences from text.
 */
export function stripAnsiEscapeSequences(text: string | null | undefined): string {
  if (!text) {
    return '';
  }
  // Pattern to match ANSI escape sequences
  // eslint-disable-next-line no-control-regex
  const ansiEscape = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
  return text.replace(ansiEscape, '');
}

// ==========================================
// Command Execution
// ==========================================

export interface ExecuteCommandOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: boolean;
}

/**
 * Execute a command and return the result.
 * Cross-platform compatible (Windows and Unix).
 */
export async function executeCommand(
  command: string,
  args: string[],
  options: ExecuteCommandOptions = {}
): Promise<CommandResult> {
  const { cwd, env, timeout = 300000, shell = false } = options;

  return new Promise((promiseResolve) => {
    const fullCommand = `${command} ${args.join(' ')}`;
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const isWindows = process.platform === 'win32';
    
    // On Windows, we need to use shell for commands like 'terraform', 'aztfexport', etc.
    // unless they're absolute paths to executables
    const useShell = shell || (isWindows && !isAbsolute(command));

    const spawnOptions: Parameters<typeof spawn>[2] = {
      cwd: cwd ?? process.cwd(),
      env: { ...process.env, ...env },
      shell: useShell,
      windowsHide: true,
    };

    const child: ChildProcess = spawn(command, args, spawnOptions);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeout);

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      promiseResolve({
        exitCode: timedOut ? -1 : (code ?? 1),
        stdout: stripAnsiEscapeSequences(stdout),
        stderr: stripAnsiEscapeSequences(stderr),
        command: fullCommand,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      promiseResolve({
        exitCode: -1,
        stdout: '',
        stderr: err.message,
        command: fullCommand,
      });
    });
  });
}

/**
 * Check if a command is available in the system PATH.
 */
export async function isCommandAvailable(command: string): Promise<boolean> {
  const checkCmd = process.platform === 'win32' ? 'where' : 'which';
  const result = await executeCommand(checkCmd, [command]);
  return result.exitCode === 0;
}

/**
 * Get version output from a command (typically --version or version).
 */
export async function getCommandVersion(
  command: string,
  versionArg = '--version'
): Promise<string | null> {
  const result = await executeCommand(command, [versionArg]);
  if (result.exitCode === 0) {
    return result.stdout.trim() || result.stderr.trim();
  }
  return null;
}

// ==========================================
// Workspace Path Resolution
// ==========================================

let cachedWorkspaceRoot: string | null = null;

/**
 * Get the workspace root directory.
 * 
 * Resolution order:
 * 1. MCP_WORKSPACE_ROOT environment variable
 * 2. /workspace (Docker container mount)
 * 3. Current working directory
 */
export function getWorkspaceRoot(): string {
  if (cachedWorkspaceRoot) {
    return cachedWorkspaceRoot;
  }

  const envPath = process.env['MCP_WORKSPACE_ROOT'];
  const candidates: string[] = [];

  if (envPath) {
    candidates.push(resolve(envPath));
  }

  // Docker container default mount
  if (process.platform !== 'win32') {
    candidates.push('/workspace');
  }

  candidates.push(process.cwd());

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate) {continue;}

    if (existsSync(candidate)) {
      cachedWorkspaceRoot = candidate;
      return candidate;
    }

    // Try to create the path if it's the env-configured one
    if (i === 0 && envPath) {
      try {
        mkdirSync(candidate, { recursive: true });
        cachedWorkspaceRoot = candidate;
        return candidate;
      } catch {
        continue;
      }
    }
  }

  // Fall back to last candidate (cwd)
  const fallback = candidates[candidates.length - 1] ?? process.cwd();
  cachedWorkspaceRoot = fallback;
  return fallback;
}

/**
 * Clear the cached workspace root (useful for testing).
 */
export function clearWorkspaceRootCache(): void {
  cachedWorkspaceRoot = null;
}

/**
 * Resolve a workspace-relative path to an absolute path.
 * 
 * @param pathLike - Relative or absolute path
 * @param allowExternalAbsolute - Allow paths outside workspace root
 */
export function resolveWorkspacePath(
  pathLike?: string | null,
  allowExternalAbsolute = false
): string {
  const workspaceRoot = getWorkspaceRoot();

  if (!pathLike?.trim()) {
    return workspaceRoot;
  }

  const candidate = resolve(pathLike);

  if (isAbsolute(pathLike)) {
    if (allowExternalAbsolute) {
      return candidate;
    }

    // Check if path is within workspace
    if (!candidate.startsWith(workspaceRoot)) {
      throw new Error(
        `Path '${candidate}' is outside the configured workspace root '${workspaceRoot}'`
      );
    }
    return candidate;
  }

  return join(workspaceRoot, pathLike);
}

// ==========================================
// File System Utilities
// ==========================================

/**
 * Find files in a directory matching a pattern.
 */
export function findFiles(
  directory: string,
  pattern: RegExp,
  recursive = true
): string[] {
  const results: string[] = [];

  if (!existsSync(directory)) {
    return results;
  }

  const entries = readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory() && recursive) {
      results.push(...findFiles(fullPath, pattern, recursive));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Find Terraform files in a directory.
 */
export function findTerraformFiles(directory: string): string[] {
  return findFiles(directory, /\.tf$/);
}

/**
 * Read and parse a JSON file safely.
 */
export function readJsonFile<T = unknown>(filePath: string): T | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Check if a path is a directory.
 */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Read all file contents from a directory.
 */
export function readDirectoryFiles(
  directory: string,
  pattern?: RegExp
): Record<string, string> {
  const files: Record<string, string> = {};

  if (!existsSync(directory)) {
    return files;
  }

  const entries = readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {continue;}
    if (pattern && !pattern.test(entry.name)) {continue;}

    const fullPath = join(directory, entry.name);
    try {
      files[entry.name] = readFileSync(fullPath, 'utf-8');
    } catch {
      // Skip files that can't be read
    }
  }

  return files;
}

// ==========================================
// Terraform-Specific Utilities
// ==========================================

/**
 * Extract HCL code from markdown code blocks.
 */
export function extractHclFromMarkdown(content: string): string {
  if (!content) {
    return '';
  }

  const lines = content.split('\n');
  const hclContent: string[] = [];
  let inHclBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('```hcl') || trimmed.startsWith('```terraform')) {
      inHclBlock = true;
      continue;
    }
    
    if (trimmed === '```' && inHclBlock) {
      inHclBlock = false;
      continue;
    }
    
    if (inHclBlock) {
      hclContent.push(line);
    }
  }

  return hclContent.join('\n');
}

/**
 * Normalize resource type for documentation lookup.
 * Removes azurerm_ prefix and replaces underscores with hyphens.
 */
export function normalizeResourceType(resourceType: string): string {
  let normalized = resourceType.toLowerCase().replace('azurerm_', '');
  normalized = normalized.replace(/_/g, '-');
  return normalized;
}

/**
 * Create a safe filename by removing invalid characters.
 */
export function safeFilename(filename: string): string {
  // Replace invalid characters with underscores
  let safeName = filename.replace(/[<>:"/\\|?*]/g, '_');
  // Remove trailing dots or spaces
  safeName = safeName.replace(/[. ]+$/, '');
  // Ensure non-empty
  return safeName || 'unnamed';
}

// ==========================================
// Docker/Container Helpers
// ==========================================

/**
 * Get context-aware tip for Docker path usage.
 */
export function getDockerPathTip(workspaceFolder: string): string {
  const isAbsolutePath = isAbsolute(workspaceFolder) || 
    (workspaceFolder.length > 1 && workspaceFolder[1] === ':');

  if (!isAbsolutePath) {
    return `
Tip: When running in Docker, use relative paths from the mounted workspace.
     Default mount: -v \${workspaceFolder}:/workspace
     Example: Use 'my-folder' instead of '/workspace/my-folder'
     The path will be automatically resolved to /workspace/my-folder

     If your mcp.json uses a different mount point, adjust paths accordingly.`;
  }

  return `
Tip: The specified path does not exist.
     When running in Docker, you cannot access host absolute paths.
     Instead, use relative paths that map to your Docker volume mount.
     Default mount: -v \${workspaceFolder}:/workspace
     Example: If your files are in \${workspaceFolder}/terraform,
              use workspace_folder: 'terraform' (not the full host path)`;
}

// ==========================================
// Installation Help Messages
// ==========================================

export const AZTFEXPORT_INSTALLATION_HELP: Record<string, string> = {
  windows: 'winget install Microsoft.AzureTerraformExporter',
  macos: 'brew install aztfexport',
  linux: 'Download from https://github.com/Azure/aztfexport/releases',
  documentation: 'https://learn.microsoft.com/azure/developer/terraform/azure-export-for-terraform/export-first-resources',
};

export const CONFTEST_INSTALLATION_HELP: Record<string, string> = {
  windows: 'choco install conftest',
  macos: 'brew install conftest',
  linux: 'Download from https://github.com/open-policy-agent/conftest/releases',
  documentation: 'https://www.conftest.dev/',
};

export const TERRAFORM_INSTALLATION_HELP: Record<string, string> = {
  windows: 'winget install HashiCorp.Terraform',
  macos: 'brew install terraform',
  linux: 'See https://developer.hashicorp.com/terraform/install',
  documentation: 'https://developer.hashicorp.com/terraform/downloads',
};
