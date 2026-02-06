/**
 * Tests for tools/aztfexport-runner.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import {
  checkAztfexportInstallation,
  exportAzureResource,
  exportAzureResourceGroup,
  exportAzureResourcesByQuery,
} from '../src/tools/aztfexport-runner.js';
import {
  ExportAzureResourceParams,
  ExportAzureResourceGroupParams,
  ExportAzureResourcesByQueryParams,
} from '../src/core/types.js';
import { createTempDir, cleanupTempDir } from './helpers.js';

// ==========================================
// Mock Setup
// ==========================================

// We need to mock the utils module
vi.mock('../src/core/utils.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/core/utils.js')>();
  return {
    ...original,
    isCommandAvailable: vi.fn(),
    getCommandVersion: vi.fn(),
    executeCommand: vi.fn(),
    resolveWorkspacePath: vi.fn((path?: string) => path ?? ''),
  };
});

import {
  isCommandAvailable,
  getCommandVersion,
  executeCommand,
  resolveWorkspacePath,
} from '../src/core/utils.js';

const mockIsCommandAvailable = vi.mocked(isCommandAvailable);
const mockGetCommandVersion = vi.mocked(getCommandVersion);
const mockExecuteCommand = vi.mocked(executeCommand);
const mockResolveWorkspacePath = vi.mocked(resolveWorkspacePath);

// Helper to parse params with defaults applied
function parseResourceParams(input: { resourceId: string; [key: string]: unknown }) {
  return ExportAzureResourceParams.parse(input);
}

function parseResourceGroupParams(input: { resourceGroupName: string; [key: string]: unknown }) {
  return ExportAzureResourceGroupParams.parse(input);
}

function parseQueryParams(input: { query: string; [key: string]: unknown }) {
  return ExportAzureResourcesByQueryParams.parse(input);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveWorkspacePath.mockImplementation((path?: string | null) => path ?? '');
});

// ==========================================
// checkAztfexportInstallation
// ==========================================

describe('checkAztfexportInstallation', () => {
  it('should return not installed when aztfexport is not available', async () => {
    mockIsCommandAvailable.mockResolvedValue(false);

    const result = await checkAztfexportInstallation({});

    expect(result.installed).toBe(false);
    expect(result.status).toContain('not installed');
    expect(result.installationHelp).toBeDefined();
  });

  it('should return installed with version when aztfexport is available', async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockGetCommandVersion
      .mockResolvedValueOnce('v0.15.0') // aztfexport version
      .mockResolvedValueOnce('v1.5.0'); // terraform version

    const result = await checkAztfexportInstallation({});

    expect(result.installed).toBe(true);
    expect(result.aztfexportVersion).toBe('v0.15.0');
    expect(result.terraformVersion).toBe('v1.5.0');
    expect(result.status).toBe('Ready to use');
  });

  it('should warn when terraform is missing', async () => {
    mockIsCommandAvailable
      .mockResolvedValueOnce(true) // aztfexport available
      .mockResolvedValueOnce(false); // terraform not available
    mockGetCommandVersion.mockResolvedValueOnce('v0.15.0');

    const result = await checkAztfexportInstallation({});

    expect(result.installed).toBe(true);
    expect(result.error).toContain('terraform is not installed');
  });

  it('should handle errors during check', async () => {
    mockIsCommandAvailable.mockRejectedValue(new Error('Command failed'));

    const result = await checkAztfexportInstallation({});

    expect(result.installed).toBe(false);
    expect(result.error).toContain('Command failed');
  });

  it('should return unknown version when version check fails', async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockGetCommandVersion.mockResolvedValue(null);

    const result = await checkAztfexportInstallation({});

    expect(result.aztfexportVersion).toBe('Unknown');
  });
});

// ==========================================
// exportAzureResource
// ==========================================

describe('exportAzureResource', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir('aztfexport-');
    mockResolveWorkspacePath.mockImplementation((path?: string | null) => join(tempDir, path ?? ''));
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should build correct command for basic export', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport resource ...',
    });

    const params = parseResourceParams({
      resourceId: '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
    });

    await exportAzureResource(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'aztfexport',
      expect.arrayContaining(['resource', '--non-interactive', '--plain-ui']),
      expect.any(Object)
    );
  });

  it('should include azapi provider flag when specified', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport resource ...',
    });

    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
      provider: 'azapi',
    });

    await exportAzureResource(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'aztfexport',
      expect.arrayContaining(['--provider-name', 'azapi']),
      expect.any(Object)
    );
  });

  it('should include resource name when specified', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport resource ...',
    });

    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
      resourceName: 'my_storage',
    });

    await exportAzureResource(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'aztfexport',
      expect.arrayContaining(['--name', 'my_storage']),
      expect.any(Object)
    );
  });

  it('should include resource type when specified', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport resource ...',
    });

    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
      resourceType: 'azurerm_storage_account',
    });

    await exportAzureResource(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'aztfexport',
      expect.arrayContaining(['--type', 'azurerm_storage_account']),
      expect.any(Object)
    );
  });

  it('should include dry-run flag when specified', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Dry run complete',
      stderr: '',
      command: 'aztfexport resource ...',
    });

    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
      dryRun: true,
    });

    await exportAzureResource(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'aztfexport',
      expect.arrayContaining(['--dry-run']),
      expect.any(Object)
    );
  });

  it('should include role assignment flag when specified', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport resource ...',
    });

    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
      includeRoleAssignment: true,
    });

    await exportAzureResource(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'aztfexport',
      expect.arrayContaining(['--include-role-assignment']),
      expect.any(Object)
    );
  });

  it('should include parallelism setting', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport resource ...',
    });

    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
      parallelism: 20,
    });

    await exportAzureResource(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'aztfexport',
      expect.arrayContaining(['--parallelism', '20']),
      expect.any(Object)
    );
  });

  it('should include continue flag when specified', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport resource ...',
    });

    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
      continueOnError: true,
    });

    await exportAzureResource(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'aztfexport',
      expect.arrayContaining(['--continue']),
      expect.any(Object)
    );
  });

  it('should return success result on successful export', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport resource ...',
    });

    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
    });

    const result = await exportAzureResource(params);

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('should return failure result on failed export', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'Authentication failed',
      command: 'aztfexport resource ...',
    });

    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
    });

    const result = await exportAzureResource(params);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Authentication failed');
  });

  it('should handle exception during export', async () => {
    mockExecuteCommand.mockRejectedValue(new Error('Process crashed'));

    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
    });

    const result = await exportAzureResource(params);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(-1);
    expect(result.error).toContain('Process crashed');
  });
});

// ==========================================
// exportAzureResourceGroup
// ==========================================

describe('exportAzureResourceGroup', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir('aztfexport-rg-');
    mockResolveWorkspacePath.mockImplementation((path?: string | null) => join(tempDir, path ?? ''));
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should build correct command for resource group export', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport resource-group ...',
    });

    const params = parseResourceGroupParams({
      resourceGroupName: 'my-resource-group',
    });

    await exportAzureResourceGroup(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'aztfexport',
      expect.arrayContaining(['resource-group', '--non-interactive', '--plain-ui', 'my-resource-group']),
      expect.any(Object)
    );
  });

  it('should include name pattern when specified', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport resource-group ...',
    });

    const params = parseResourceGroupParams({
      resourceGroupName: 'my-rg',
      namePattern: 'res_{name}',
    });

    await exportAzureResourceGroup(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'aztfexport',
      expect.arrayContaining(['--name-pattern', 'res_{name}']),
      expect.any(Object)
    );
  });

  it('should include type pattern when specified', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport resource-group ...',
    });

    const params = parseResourceGroupParams({
      resourceGroupName: 'my-rg',
      typePattern: 'Microsoft.Storage/*',
    });

    await exportAzureResourceGroup(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'aztfexport',
      expect.arrayContaining(['--type-pattern', 'Microsoft.Storage/*']),
      expect.any(Object)
    );
  });

  it('should return success on successful export', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport resource-group ...',
    });

    const params = parseResourceGroupParams({
      resourceGroupName: 'my-rg',
    });

    const result = await exportAzureResourceGroup(params);

    expect(result.success).toBe(true);
  });
});

// ==========================================
// exportAzureResourcesByQuery
// ==========================================

describe('exportAzureResourcesByQuery', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir('aztfexport-query-');
    mockResolveWorkspacePath.mockImplementation((path?: string | null) => join(tempDir, path ?? ''));
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should build correct command for query export', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport query ...',
    });

    const params = parseQueryParams({
      query: "type == 'Microsoft.Storage/storageAccounts'",
    });

    await exportAzureResourcesByQuery(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'aztfexport',
      expect.arrayContaining(['query', '--non-interactive', '--plain-ui']),
      expect.any(Object)
    );
  });

  it('should include the query parameter', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport query ...',
    });

    const query = "type == 'Microsoft.Compute/virtualMachines'";
    const params = parseQueryParams({ query });

    await exportAzureResourcesByQuery(params);

    // The query should be the last argument
    const callArgs = mockExecuteCommand.mock.calls[0]?.[1] as string[];
    expect(callArgs[callArgs.length - 1]).toBe(query);
  });

  it('should include all optional parameters', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport query ...',
    });

    const params = parseQueryParams({
      query: "type == 'Microsoft.Storage/storageAccounts'",
      provider: 'azapi',
      namePattern: 'resource_{name}',
      typePattern: '*',
      dryRun: true,
      includeRoleAssignment: true,
      parallelism: 5,
      continueOnError: true,
    });

    await exportAzureResourcesByQuery(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'aztfexport',
      expect.arrayContaining([
        '--provider-name', 'azapi',
        '--name-pattern', 'resource_{name}',
        '--type-pattern', '*',
        '--dry-run',
        '--include-role-assignment',
        '--parallelism', '5',
        '--continue',
      ]),
      expect.any(Object)
    );
  });

  it('should return success on successful export', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Export complete',
      stderr: '',
      command: 'aztfexport query ...',
    });

    const params = parseQueryParams({
      query: "type == 'Microsoft.Storage/storageAccounts'",
    });

    const result = await exportAzureResourcesByQuery(params);

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('should handle export failure', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'Query returned no results',
      command: 'aztfexport query ...',
    });

    const params = parseQueryParams({
      query: "type == 'NonExistent'",
    });

    const result = await exportAzureResourcesByQuery(params);

    expect(result.success).toBe(false);
    expect(result.stderr).toContain('Query returned no results');
  });
});

// ==========================================
// Command Options
// ==========================================

describe('command options', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir('aztfexport-opts-');
    mockResolveWorkspacePath.mockImplementation((path?: string | null) => join(tempDir, path ?? ''));
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should set timeout for resource export', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
      command: '',
    });

    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
    });

    await exportAzureResource(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        timeout: 600000, // 10 minutes
      })
    );
  });

  it('should set timeout for resource group export', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
      command: '',
    });

    const params = parseResourceGroupParams({
      resourceGroupName: 'rg',
    });

    await exportAzureResourceGroup(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        timeout: 900000, // 15 minutes
      })
    );
  });

  it('should set cwd to temp directory', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
      command: '',
    });

    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
    });

    await exportAzureResource(params);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        cwd: expect.any(String),
      })
    );
  });
});
