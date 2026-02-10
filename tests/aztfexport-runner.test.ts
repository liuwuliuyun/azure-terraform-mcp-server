/**
 * Tests for tools/aztfexport-runner.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkAztfexportInstallation,
  generateExportAzureResourceCommand,
  generateExportAzureResourceGroupCommand,
  generateExportAzureResourcesByQueryCommand,
} from '../src/tools/aztfexport-runner.js';
import {
  ExportAzureResourceParams,
  ExportAzureResourceGroupParams,
  ExportAzureResourcesByQueryParams,
} from '../src/core/types.js';

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
    resolveWorkspacePath: vi.fn((path?: string | null) => `/workspace/${path || ''}`),
  };
});

import {
  isCommandAvailable,
  getCommandVersion,
} from '../src/core/utils.js';

const mockIsCommandAvailable = vi.mocked(isCommandAvailable);
const mockGetCommandVersion = vi.mocked(getCommandVersion);

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
// generateExportAzureResourceCommand
// ==========================================

describe('generateExportAzureResourceCommand', () => {
  it('should include --continue flag by default', () => {
    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
    });

    const result = generateExportAzureResourceCommand(params);

    expect(result.args).toContain('--continue');
  });

  it('should not include workingDirectory when outputFolderName is not specified', () => {
    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
    });

    const result = generateExportAzureResourceCommand(params);

    expect(result.workingDirectory).toBeUndefined();
    expect(result.outputFolderName).toBeUndefined();
  });

  it('should include workingDirectory when outputFolderName is specified', () => {
    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
      outputFolderName: 'my-output',
    });

    const result = generateExportAzureResourceCommand(params);

    expect(result.workingDirectory).toBeDefined();
    expect(result.workingDirectory).toBe('/workspace/my-output');
    expect(result.outputFolderName).toBe('my-output');
  });

  it('should allow explicitly setting continueOnError to false', () => {
    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
      continueOnError: false,
    });

    const result = generateExportAzureResourceCommand(params);

    expect(result.args).not.toContain('--continue');
  });

  it('should include standard command args', () => {
    const params = parseResourceParams({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
    });

    const result = generateExportAzureResourceCommand(params);

    expect(result.command).toBe('aztfexport');
    expect(result.args).toContain('resource');
    expect(result.args).toContain('--non-interactive');
    expect(result.args).toContain('--plain-ui');
  });

  it('should include resource ID at the end of args', () => {
    const resourceId = '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa';
    const params = parseResourceParams({ resourceId });

    const result = generateExportAzureResourceCommand(params);

    expect(result.args[result.args.length - 1]).toBe(resourceId);
  });
});

// ==========================================
// generateExportAzureResourceGroupCommand
// ==========================================

describe('generateExportAzureResourceGroupCommand', () => {
  it('should include --continue flag by default', () => {
    const params = parseResourceGroupParams({
      resourceGroupName: 'my-rg',
    });

    const result = generateExportAzureResourceGroupCommand(params);

    expect(result.args).toContain('--continue');
  });

  it('should not include workingDirectory when outputFolderName is not specified', () => {
    const params = parseResourceGroupParams({
      resourceGroupName: 'my-rg',
    });

    const result = generateExportAzureResourceGroupCommand(params);

    expect(result.workingDirectory).toBeUndefined();
    expect(result.outputFolderName).toBeUndefined();
  });

  it('should include workingDirectory when outputFolderName is specified', () => {
    const params = parseResourceGroupParams({
      resourceGroupName: 'my-rg',
      outputFolderName: 'rg-output',
    });

    const result = generateExportAzureResourceGroupCommand(params);

    expect(result.workingDirectory).toBeDefined();
    expect(result.workingDirectory).toBe('/workspace/rg-output');
    expect(result.outputFolderName).toBe('rg-output');
  });

  it('should allow explicitly setting continueOnError to false', () => {
    const params = parseResourceGroupParams({
      resourceGroupName: 'my-rg',
      continueOnError: false,
    });

    const result = generateExportAzureResourceGroupCommand(params);

    expect(result.args).not.toContain('--continue');
  });

  it('should include standard command args', () => {
    const params = parseResourceGroupParams({
      resourceGroupName: 'my-rg',
    });

    const result = generateExportAzureResourceGroupCommand(params);

    expect(result.command).toBe('aztfexport');
    expect(result.args).toContain('resource-group');
    expect(result.args).toContain('--non-interactive');
    expect(result.args).toContain('--plain-ui');
  });

  it('should include resource group name at the end of args', () => {
    const rgName = 'my-rg';
    const params = parseResourceGroupParams({ resourceGroupName: rgName });

    const result = generateExportAzureResourceGroupCommand(params);

    expect(result.args[result.args.length - 1]).toBe(rgName);
  });
});

// ==========================================
// generateExportAzureResourcesByQueryCommand
// ==========================================

describe('generateExportAzureResourcesByQueryCommand', () => {
  it('should include --continue flag by default', () => {
    const params = parseQueryParams({
      query: "type == 'Microsoft.Storage/storageAccounts'",
    });

    const result = generateExportAzureResourcesByQueryCommand(params);

    expect(result.args).toContain('--continue');
  });

  it('should not include workingDirectory when outputFolderName is not specified', () => {
    const params = parseQueryParams({
      query: "type == 'Microsoft.Storage/storageAccounts'",
    });

    const result = generateExportAzureResourcesByQueryCommand(params);

    expect(result.workingDirectory).toBeUndefined();
    expect(result.outputFolderName).toBeUndefined();
  });

  it('should include workingDirectory when outputFolderName is specified', () => {
    const params = parseQueryParams({
      query: "type == 'Microsoft.Storage/storageAccounts'",
      outputFolderName: 'query-output',
    });

    const result = generateExportAzureResourcesByQueryCommand(params);

    expect(result.workingDirectory).toBeDefined();
    expect(result.workingDirectory).toBe('/workspace/query-output');
    expect(result.outputFolderName).toBe('query-output');
  });

  it('should allow explicitly setting continueOnError to false', () => {
    const params = parseQueryParams({
      query: "type == 'Microsoft.Storage/storageAccounts'",
      continueOnError: false,
    });

    const result = generateExportAzureResourcesByQueryCommand(params);

    expect(result.args).not.toContain('--continue');
  });

  it('should include standard command args', () => {
    const params = parseQueryParams({
      query: "type == 'Microsoft.Storage/storageAccounts'",
    });

    const result = generateExportAzureResourcesByQueryCommand(params);

    expect(result.command).toBe('aztfexport');
    expect(result.args).toContain('query');
    expect(result.args).toContain('--non-interactive');
    expect(result.args).toContain('--plain-ui');
  });

  it('should include query at the end of args', () => {
    const query = "type == 'Microsoft.Storage/storageAccounts'";
    const params = parseQueryParams({ query });

    const result = generateExportAzureResourcesByQueryCommand(params);

    expect(result.args[result.args.length - 1]).toBe(query);
  });
});

