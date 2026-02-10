/**
 * Tests for aztfexport-command-generator.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateExportAzureResourceCommand,
  generateExportAzureResourceGroupCommand,
  generateExportAzureResourcesByQueryCommand,
} from '../src/tools/aztfexport-command-generator.js';
import {
  ExportAzureResourceParams,
  ExportAzureResourceGroupParams,
  ExportAzureResourcesByQueryParams,
} from '../src/core/types.js';

// Mock resolveWorkspacePath
vi.mock('../src/core/utils.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/core/utils.js')>();
  return {
    ...original,
    resolveWorkspacePath: vi.fn((path?: string | null) => `/workspace/${path || ''}`),
  };
});

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
