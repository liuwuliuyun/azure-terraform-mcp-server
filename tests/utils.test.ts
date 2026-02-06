/**
 * Tests for core/utils.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  stripAnsiEscapeSequences,
  getWorkspaceRoot,
  clearWorkspaceRootCache,
  resolveWorkspacePath,
  findFiles,
  findTerraformFiles,
  readJsonFile,
  isDirectory,
  readDirectoryFiles,
  extractHclFromMarkdown,
  normalizeResourceType,
  safeFilename,
  getDockerPathTip,
} from '../src/core/utils.js';
import {
  createTempDir,
  cleanupTempDir,
  createFile,
  createFiles,
  createSubDir,
  mockEnv,
  SAMPLE_TF_CONTENT,
} from './helpers.js';

// ==========================================
// stripAnsiEscapeSequences
// ==========================================

describe('stripAnsiEscapeSequences', () => {
  it('should return empty string for null input', () => {
    expect(stripAnsiEscapeSequences(null)).toBe('');
  });

  it('should return empty string for undefined input', () => {
    expect(stripAnsiEscapeSequences(undefined)).toBe('');
  });

  it('should return empty string for empty string input', () => {
    expect(stripAnsiEscapeSequences('')).toBe('');
  });

  it('should return same string when no ANSI codes present', () => {
    const text = 'Hello, World!';
    expect(stripAnsiEscapeSequences(text)).toBe(text);
  });

  it('should strip color codes', () => {
    const text = '\x1B[31mRed Text\x1B[0m';
    expect(stripAnsiEscapeSequences(text)).toBe('Red Text');
  });

  it('should strip bold codes', () => {
    const text = '\x1B[1mBold\x1B[0m Normal';
    expect(stripAnsiEscapeSequences(text)).toBe('Bold Normal');
  });

  it('should strip multiple ANSI codes', () => {
    const text = '\x1B[32m\x1B[1mGreen Bold\x1B[0m \x1B[34mBlue\x1B[0m';
    expect(stripAnsiEscapeSequences(text)).toBe('Green Bold Blue');
  });

  it('should strip cursor movement codes', () => {
    const text = '\x1B[2AUp two lines\x1B[KClear line';
    expect(stripAnsiEscapeSequences(text)).toBe('Up two linesClear line');
  });
});

// ==========================================
// Workspace Path Functions
// ==========================================

describe('getWorkspaceRoot', () => {
  let tempDir: string;
  let restoreEnv: () => void;

  beforeEach(() => {
    clearWorkspaceRootCache();
    tempDir = createTempDir();
  });

  afterEach(() => {
    restoreEnv?.();
    cleanupTempDir(tempDir);
    clearWorkspaceRootCache();
  });

  it('should use MCP_WORKSPACE_ROOT when set', () => {
    restoreEnv = mockEnv({ MCP_WORKSPACE_ROOT: tempDir });
    const root = getWorkspaceRoot();
    expect(root).toBe(tempDir);
  });

  it('should cache the workspace root', () => {
    restoreEnv = mockEnv({ MCP_WORKSPACE_ROOT: tempDir });
    const root1 = getWorkspaceRoot();
    const root2 = getWorkspaceRoot();
    expect(root1).toBe(root2);
  });

  it('should fallback to cwd when env not set', () => {
    restoreEnv = mockEnv({ MCP_WORKSPACE_ROOT: undefined });
    const root = getWorkspaceRoot();
    expect(root).toBe(process.cwd());
  });
});

describe('resolveWorkspacePath', () => {
  let tempDir: string;
  let restoreEnv: () => void;

  beforeEach(() => {
    clearWorkspaceRootCache();
    tempDir = createTempDir();
    restoreEnv = mockEnv({ MCP_WORKSPACE_ROOT: tempDir });
  });

  afterEach(() => {
    restoreEnv();
    cleanupTempDir(tempDir);
    clearWorkspaceRootCache();
  });

  it('should return workspace root for null path', () => {
    expect(resolveWorkspacePath(null)).toBe(tempDir);
  });

  it('should return workspace root for empty path', () => {
    expect(resolveWorkspacePath('')).toBe(tempDir);
  });

  it('should return workspace root for whitespace path', () => {
    expect(resolveWorkspacePath('   ')).toBe(tempDir);
  });

  it('should join relative path with workspace root', () => {
    const result = resolveWorkspacePath('subdir');
    expect(result).toContain('subdir');
    expect(result.startsWith(tempDir)).toBe(true);
  });

  it('should throw for absolute path outside workspace', () => {
    const externalPath = process.platform === 'win32' ? 'C:\\Windows' : '/tmp';
    expect(() => resolveWorkspacePath(externalPath)).toThrow(
      /outside the configured workspace root/
    );
  });

  it('should allow external absolute path when allowExternalAbsolute is true', () => {
    const externalPath = process.platform === 'win32' ? 'C:\\Windows' : '/tmp';
    const result = resolveWorkspacePath(externalPath, true);
    expect(result).toBe(externalPath);
  });
});

// ==========================================
// File System Functions
// ==========================================

describe('findFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should return empty array for non-existent directory', () => {
    const result = findFiles('/non/existent/path', /\.tf$/);
    expect(result).toEqual([]);
  });

  it('should find files matching pattern', () => {
    createFiles(tempDir, {
      'main.tf': SAMPLE_TF_CONTENT,
      'variables.tf': 'variable "name" {}',
      'readme.md': '# README',
    });

    const result = findFiles(tempDir, /\.tf$/);
    expect(result).toHaveLength(2);
    expect(result.some((f) => f.endsWith('main.tf'))).toBe(true);
    expect(result.some((f) => f.endsWith('variables.tf'))).toBe(true);
  });

  it('should search recursively by default', () => {
    const subDir = createSubDir(tempDir, 'modules');
    createFile(tempDir, 'main.tf', SAMPLE_TF_CONTENT);
    createFile(subDir, 'module.tf', 'resource "null_resource" "test" {}');

    const result = findFiles(tempDir, /\.tf$/);
    expect(result).toHaveLength(2);
  });

  it('should not search recursively when recursive is false', () => {
    const subDir = createSubDir(tempDir, 'modules');
    createFile(tempDir, 'main.tf', SAMPLE_TF_CONTENT);
    createFile(subDir, 'module.tf', 'resource "null_resource" "test" {}');

    const result = findFiles(tempDir, /\.tf$/, false);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('main.tf');
  });
});

describe('findTerraformFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should find only .tf files', () => {
    createFiles(tempDir, {
      'main.tf': SAMPLE_TF_CONTENT,
      'config.json': '{}',
      'script.sh': '#!/bin/bash',
    });

    const result = findTerraformFiles(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('main.tf');
  });
});

describe('readJsonFile', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should parse valid JSON file', () => {
    const data = { name: 'test', value: 123 };
    createFile(tempDir, 'data.json', JSON.stringify(data));

    const result = readJsonFile<typeof data>(`${tempDir}/data.json`);
    expect(result).toEqual(data);
  });

  it('should return null for non-existent file', () => {
    const result = readJsonFile('/non/existent/file.json');
    expect(result).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    createFile(tempDir, 'invalid.json', 'not valid json');
    const result = readJsonFile(`${tempDir}/invalid.json`);
    expect(result).toBeNull();
  });
});

describe('isDirectory', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should return true for directory', () => {
    expect(isDirectory(tempDir)).toBe(true);
  });

  it('should return false for file', () => {
    const filePath = createFile(tempDir, 'test.txt', 'content');
    expect(isDirectory(filePath)).toBe(false);
  });

  it('should return false for non-existent path', () => {
    expect(isDirectory('/non/existent/path')).toBe(false);
  });
});

describe('readDirectoryFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should read all files in directory', () => {
    createFiles(tempDir, {
      'file1.txt': 'content1',
      'file2.txt': 'content2',
    });

    const result = readDirectoryFiles(tempDir);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['file1.txt']).toBe('content1');
    expect(result['file2.txt']).toBe('content2');
  });

  it('should filter by pattern', () => {
    createFiles(tempDir, {
      'main.tf': SAMPLE_TF_CONTENT,
      'readme.md': '# README',
    });

    const result = readDirectoryFiles(tempDir, /\.tf$/);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['main.tf']).toBeDefined();
  });

  it('should return empty object for non-existent directory', () => {
    const result = readDirectoryFiles('/non/existent/path');
    expect(result).toEqual({});
  });

  it('should skip directories', () => {
    createFile(tempDir, 'file.txt', 'content');
    createSubDir(tempDir, 'subdir');

    const result = readDirectoryFiles(tempDir);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['file.txt']).toBe('content');
  });
});

// ==========================================
// Terraform-Specific Functions
// ==========================================

describe('extractHclFromMarkdown', () => {
  it('should return empty string for empty input', () => {
    expect(extractHclFromMarkdown('')).toBe('');
  });

  it('should extract HCL from markdown code blocks', () => {
    const markdown = `
# Example

\`\`\`hcl
resource "azurerm_resource_group" "example" {
  name     = "example"
  location = "West Europe"
}
\`\`\`

Some text here.
`;

    const result = extractHclFromMarkdown(markdown);
    expect(result).toContain('resource "azurerm_resource_group"');
    expect(result).toContain('location = "West Europe"');
  });

  it('should extract from terraform code blocks', () => {
    const markdown = `
\`\`\`terraform
variable "name" {
  type = string
}
\`\`\`
`;

    const result = extractHclFromMarkdown(markdown);
    expect(result).toContain('variable "name"');
  });

  it('should handle multiple code blocks', () => {
    const markdown = `
\`\`\`hcl
resource "first" "a" {}
\`\`\`

\`\`\`hcl
resource "second" "b" {}
\`\`\`
`;

    const result = extractHclFromMarkdown(markdown);
    expect(result).toContain('resource "first"');
    expect(result).toContain('resource "second"');
  });

  it('should ignore non-HCL code blocks', () => {
    const markdown = `
\`\`\`python
print("hello")
\`\`\`

\`\`\`hcl
resource "test" "example" {}
\`\`\`
`;

    const result = extractHclFromMarkdown(markdown);
    expect(result).not.toContain('print');
    expect(result).toContain('resource "test"');
  });
});

describe('normalizeResourceType', () => {
  it('should remove azurerm_ prefix', () => {
    expect(normalizeResourceType('azurerm_storage_account')).toBe('storage-account');
  });

  it('should handle uppercase', () => {
    expect(normalizeResourceType('AZURERM_RESOURCE_GROUP')).toBe('resource-group');
  });

  it('should replace underscores with hyphens', () => {
    expect(normalizeResourceType('virtual_machine_scale_set')).toBe('virtual-machine-scale-set');
  });

  it('should handle already normalized input', () => {
    expect(normalizeResourceType('storage-account')).toBe('storage-account');
  });
});

describe('safeFilename', () => {
  it('should return unchanged for valid filename', () => {
    expect(safeFilename('valid-filename.txt')).toBe('valid-filename.txt');
  });

  it('should replace invalid characters', () => {
    expect(safeFilename('file<name>:test.txt')).toBe('file_name__test.txt');
  });

  it('should remove trailing dots', () => {
    expect(safeFilename('filename...')).toBe('filename');
  });

  it('should remove trailing spaces', () => {
    expect(safeFilename('filename   ')).toBe('filename');
  });

  it('should return "unnamed" for empty result', () => {
    expect(safeFilename('...')).toBe('unnamed');
  });

  it('should handle Windows path separators', () => {
    expect(safeFilename('path\\to\\file')).toBe('path_to_file');
  });
});

describe('getDockerPathTip', () => {
  it('should return relative path tip for relative paths', () => {
    const tip = getDockerPathTip('my-folder');
    expect(tip).toContain('relative paths');
    expect(tip).toContain('/workspace');
  });

  it('should return absolute path tip for absolute paths on Unix', () => {
    const tip = getDockerPathTip('/home/user/folder');
    expect(tip).toContain('does not exist');
    expect(tip).toContain('Docker');
  });

  it('should return absolute path tip for Windows paths', () => {
    const tip = getDockerPathTip('C:\\Users\\test');
    expect(tip).toContain('does not exist');
  });
});
