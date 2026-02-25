/**
 * Tests for server.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { createServer, SERVER_VERSION } from '../src/server.js';

// ==========================================
// Mock all tool modules to prevent real network calls
// ==========================================

vi.mock('../src/tools/azurerm-docs-provider.js', () => ({
  getAzureRMProviderDocumentation: vi.fn().mockResolvedValue({
    resourceType: 'test',
    documentationUrl: '',
    summary: '',
    arguments: [],
    attributes: [],
    examples: [],
    notes: [],
  }),
}));

vi.mock('../src/tools/azapi-docs-provider.js', () => ({
  getAzAPIProviderDocumentation: vi.fn().mockResolvedValue({
    resourceType: 'test',
    apiVersion: 'latest',
    source: 'mock',
  }),
}));

vi.mock('../src/tools/avm-docs-provider.js', () => ({
  listAvmModules: vi.fn().mockResolvedValue([]),
  getAvmLatestVersion: vi.fn().mockResolvedValue(''),
  getAvmVersions: vi.fn().mockResolvedValue([]),
  getAvmDocumentation: vi.fn().mockResolvedValue(''),
}));

vi.mock('../src/tools/aztfexport-runner.js', () => ({
  checkAztfexportInstallation: vi.fn().mockResolvedValue({ installed: false, status: 'mock' }),
  generateExportAzureResourceCommand_impl: vi.fn().mockResolvedValue({ command: 'aztfexport', args: [], description: '' }),
  generateExportAzureResourceGroupCommand_impl: vi.fn().mockResolvedValue({ command: 'aztfexport', args: [], description: '' }),
  generateExportAzureResourcesByQueryCommand_impl: vi.fn().mockResolvedValue({ command: 'aztfexport', args: [], description: '' }),
}));

vi.mock('../src/tools/conftest-runner.js', () => ({
  checkConftestInstallation: vi.fn().mockResolvedValue({ installed: false, status: 'mock' }),
  generateConftestWorkspaceValidationCommand_impl: vi.fn().mockResolvedValue({ command: 'conftest', args: [], description: '' }),
  generateConftestWorkspacePlanValidationCommand_impl: vi.fn().mockResolvedValue({ command: 'conftest', args: [], description: '' }),
  setupConftestEnvironment: vi.fn().mockResolvedValue({ success: false, message: 'mock' }),
}));

vi.mock('../src/core/telemetry.js', () => ({
  trackToolCall: vi.fn(),
}));

// ==========================================
// SERVER_VERSION
// ==========================================

describe('SERVER_VERSION', () => {
  it('should be a valid semver string', () => {
    expect(typeof SERVER_VERSION).toBe('string');
    expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

// ==========================================
// createServer
// ==========================================

describe('createServer', () => {
  it('should create an MCP server instance', () => {
    const server = createServer();
    expect(server).toBeDefined();
  });

  it('should return a server with tool method', () => {
    const server = createServer();
    expect(typeof server.tool).toBe('function');
  });

  it('should be callable multiple times', () => {
    const server1 = createServer();
    const server2 = createServer();
    expect(server1).toBeDefined();
    expect(server2).toBeDefined();
    expect(server1).not.toBe(server2);
  });
});
