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

import type { InstallationHelp, PlatformInstallCommand } from './types.js';

/**
 * Detect the current platform as a user-friendly label.
 */
function detectPlatformLabel(): string {
  return process.platform; // 'win32' | 'darwin' | 'linux'
}

/**
 * Resolve the recommended install command for the current platform.
 */
function resolveRecommendedCommand(commands: PlatformInstallCommand[]): string {
  const platformMap: Record<string, string> = {
    win32: 'windows',
    darwin: 'macos',
    linux: 'linux',
  };
  const mapped = platformMap[process.platform] ?? 'linux';
  const match = commands.find((c) => c.platform === mapped);
  return match?.command ?? commands[0]?.command ?? 'See documentation';
}

/**
 * Build a structured, agent-friendly InstallationHelp object.
 *
 * The returned object is designed for AI agent consumption via MCP:
 * - `recommendedInstallCommand` is pre-resolved to the server's OS
 * - `verifyCommand` tells the agent how to confirm installation
 * - `allPlatformCommands` provides full cross-platform instructions
 */
function buildInstallationHelp(
  toolName: string,
  platformCommands: PlatformInstallCommand[],
  documentationUrl: string,
  verifyCommand: string,
  pathGuidance: Record<string, string>,
  additionalNotes?: string[]
): InstallationHelp {
  return {
    toolName,
    detectedPlatform: detectPlatformLabel(),
    recommendedInstallCommand: resolveRecommendedCommand(platformCommands),
    verifyCommand,
    allPlatformCommands: platformCommands,
    documentationUrl,
    pathGuidance,
    additionalNotes,
  };
}

/**
 * Get structured installation help for Azure Export for Terraform (aztfexport).
 *
 * Sources:
 * - https://github.com/Azure/aztfexport#install
 * - https://github.com/Azure/aztfexport/releases
 */
export function getAztfexportInstallationHelp(): InstallationHelp {
  return buildInstallationHelp(
    'aztfexport',
    [
      { platform: 'windows', method: 'winget', command: 'winget install aztfexport', managesPath: true },
      { platform: 'macos', method: 'brew', command: 'brew install aztfexport', managesPath: true },
      { platform: 'linux', method: 'brew', command: 'brew install aztfexport', managesPath: true },
      { platform: 'linux', method: 'apt', command: 'curl -sSL https://packages.microsoft.com/keys/microsoft.asc > /etc/apt/trusted.gpg.d/microsoft.asc && apt-add-repository https://packages.microsoft.com/ubuntu/22.04/prod && apt-get update && apt-get install -y aztfexport', managesPath: true },
      { platform: 'linux', method: 'dnf', command: 'rpm --import https://packages.microsoft.com/keys/microsoft.asc && dnf install -y https://packages.microsoft.com/config/rhel/9/packages-microsoft-prod.rpm && dnf install -y aztfexport', managesPath: true },
      { platform: 'linux', method: 'manual', command: 'Download the zip for your architecture from https://github.com/Azure/aztfexport/releases, extract it, and move the aztfexport binary to a directory in your PATH (e.g., /usr/local/bin).', managesPath: false },
      { platform: 'windows', method: 'manual', command: 'Download the zip for your architecture from https://github.com/Azure/aztfexport/releases, extract it, and add the folder containing aztfexport.exe to your system PATH.', managesPath: false },
    ],
    'https://github.com/Azure/aztfexport#install',
    'aztfexport --version',
    {
      windows: 'If installed via winget, PATH is managed automatically. For manual install: extract the zip, place aztfexport.exe in a folder (e.g., C:\\Tools\\aztfexport), then add that folder to your system PATH via System Properties > Environment Variables > Path.',
      macos: 'If installed via brew, PATH is managed automatically. For manual install: extract the zip and run: sudo mv aztfexport /usr/local/bin/',
      linux: 'If installed via brew/apt/dnf, PATH is managed automatically. For manual install: extract the zip and run: sudo mv aztfexport /usr/local/bin/',
    },
    [
      'aztfexport requires Terraform (>= v0.12) to be installed and available in PATH.',
      'Ensure you are authenticated to Azure before running export commands (e.g., run: az login).',
      'On Windows you may need to restart your terminal/shell after installation for PATH changes to take effect.',
    ]
  );
}

/**
 * Get structured installation help for Conftest.
 *
 * Sources:
 * - https://www.conftest.dev/install/
 * - https://github.com/open-policy-agent/conftest/releases
 */
export function getConftestInstallationHelp(): InstallationHelp {
  return buildInstallationHelp(
    'conftest',
    [
      { platform: 'windows', method: 'scoop', command: 'scoop install conftest', managesPath: true },
      { platform: 'macos', method: 'brew', command: 'brew install conftest', managesPath: true },
      { platform: 'linux', method: 'brew', command: 'brew install conftest', managesPath: true },
      { platform: 'linux', method: 'manual', command: 'LATEST_VERSION=$(wget -O - "https://api.github.com/repos/open-policy-agent/conftest/releases/latest" | grep \'"tag_name":\' | sed -E \'s/.*"([^"]+)".*/\\1/\' | cut -c 2-) && wget "https://github.com/open-policy-agent/conftest/releases/download/v${LATEST_VERSION}/conftest_${LATEST_VERSION}_Linux_x86_64.tar.gz" && tar xzf conftest_${LATEST_VERSION}_Linux_x86_64.tar.gz && sudo mv conftest /usr/local/bin/', managesPath: false },
      { platform: 'windows', method: 'manual', command: 'Download the .zip for Windows from https://github.com/open-policy-agent/conftest/releases, extract it, and add the folder containing conftest.exe to your system PATH.', managesPath: false },
      { platform: 'macos', method: 'manual', command: 'Download the .tar.gz for macOS from https://github.com/open-policy-agent/conftest/releases, extract it, and run: sudo mv conftest /usr/local/bin/', managesPath: false },
    ],
    'https://www.conftest.dev/install/',
    'conftest --version',
    {
      windows: 'If installed via scoop, PATH is managed automatically. For manual install: extract the zip, place conftest.exe in a folder (e.g., C:\\Tools\\conftest), then add that folder to your system PATH via System Properties > Environment Variables > Path.',
      macos: 'If installed via brew, PATH is managed automatically. For manual install: extract the tar.gz and run: sudo mv conftest /usr/local/bin/',
      linux: 'If installed via brew, PATH is managed automatically. For manual install: extract the tar.gz and run: sudo mv conftest /usr/local/bin/',
    },
    [
      'On Windows you may need to restart your terminal/shell after installation for PATH changes to take effect.',
    ]
  );
}

/**
 * Get structured installation help for Terraform.
 *
 * Sources:
 * - https://developer.hashicorp.com/terraform/install
 * - https://github.com/hashicorp/terraform
 */
export function getTerraformInstallationHelp(): InstallationHelp {
  return buildInstallationHelp(
    'terraform',
    [
      { platform: 'windows', method: 'winget', command: 'winget install HashiCorp.Terraform', managesPath: true },
      { platform: 'macos', method: 'brew', command: 'brew tap hashicorp/tap && brew install hashicorp/tap/terraform', managesPath: true },
      { platform: 'linux', method: 'apt', command: 'wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list && sudo apt-get update && sudo apt-get install -y terraform', managesPath: true },
      { platform: 'linux', method: 'dnf', command: 'sudo dnf install -y dnf-plugins-core && sudo dnf config-manager --add-repo https://rpm.releases.hashicorp.com/RHEL/hashicorp.repo && sudo dnf install -y terraform', managesPath: true },
      { platform: 'linux', method: 'manual', command: 'Download the binary for your architecture from https://developer.hashicorp.com/terraform/install, unzip it, and move the terraform binary to a directory in your PATH (e.g., /usr/local/bin).', managesPath: false },
      { platform: 'windows', method: 'manual', command: 'Download the .zip from https://developer.hashicorp.com/terraform/install, extract terraform.exe, and add the folder containing it to your system PATH.', managesPath: false },
    ],
    'https://developer.hashicorp.com/terraform/install',
    'terraform --version',
    {
      windows: 'If installed via winget, PATH is managed automatically. For manual install: extract terraform.exe to a folder (e.g., C:\\Tools\\terraform), then add that folder to your system PATH via System Properties > Environment Variables > Path. Restart your terminal after.',
      macos: 'If installed via brew, PATH is managed automatically. For manual install: unzip and run: sudo mv terraform /usr/local/bin/',
      linux: 'If installed via apt/dnf, PATH is managed automatically. For manual install: unzip and run: sudo mv terraform /usr/local/bin/',
    },
    [
      'On Windows you may need to restart your terminal/shell after installation for PATH changes to take effect.',
    ]
  );
}

// Legacy aliases for backward compatibility (deprecated — prefer the functions above)
export const AZTFEXPORT_INSTALLATION_HELP = getAztfexportInstallationHelp();
export const CONFTEST_INSTALLATION_HELP = getConftestInstallationHelp();
export const TERRAFORM_INSTALLATION_HELP = getTerraformInstallationHelp();
