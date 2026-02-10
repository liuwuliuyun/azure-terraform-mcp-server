/**
 * Tests for tools/conftest-runner.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkConftestInstallation,
  generateConftestWorkspaceValidationCommand,
  generateConftestWorkspacePlanValidationCommand,
} from '../src/tools/conftest-runner.js';
import {
  RunConftestWorkspaceValidationParams,
  RunConftestWorkspacePlanValidationParams,
} from '../src/core/types.js';

// ==========================================
// Mock Setup
// ==========================================

vi.mock('../src/core/utils.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/core/utils.js')>();
  return {
    ...original,
    isCommandAvailable: vi.fn(),
    getCommandVersion: vi.fn(),
    resolveWorkspacePath: vi.fn((path?: string | null) => `/workspace/${path || ''}`),
    CONFTEST_INSTALLATION_HELP: 'Install conftest from https://conftest.dev',
  };
});

import {
  isCommandAvailable,
  getCommandVersion,
} from '../src/core/utils.js';

const mockIsCommandAvailable = vi.mocked(isCommandAvailable);
const mockGetCommandVersion = vi.mocked(getCommandVersion);

// Helper functions to parse params with defaults applied
function parseWorkspaceValidationParams(input: { workspaceFolder: string; [key: string]: unknown }) {
  return RunConftestWorkspaceValidationParams.parse(input);
}

function parsePlanValidationParams(input: { folderName: string; [key: string]: unknown }) {
  return RunConftestWorkspacePlanValidationParams.parse(input);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ==========================================
// checkConftestInstallation
// ==========================================

describe('checkConftestInstallation', () => {
  it('should return not installed when conftest is not available', async () => {
    mockIsCommandAvailable.mockResolvedValue(false);

    const result = await checkConftestInstallation({});

    expect(result.installed).toBe(false);
    expect(result.status).toContain('not installed');
    expect(result.installationHelp).toBeDefined();
  });

  it('should return installed with version when conftest is available', async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockGetCommandVersion.mockResolvedValue('v0.45.0');

    const result = await checkConftestInstallation({});

    expect(result.installed).toBe(true);
    expect(result.version).toBe('v0.45.0');
    expect(result.status).toContain('ready to use');
  });

  it('should handle version check returning null', async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockGetCommandVersion.mockResolvedValue(null);

    const result = await checkConftestInstallation({});

    expect(result.installed).toBe(true);
    expect(result.version).toBe('Unknown');
  });

  it('should handle errors during check', async () => {
    mockIsCommandAvailable.mockRejectedValue(new Error('Command failed'));

    const result = await checkConftestInstallation({});

    expect(result.installed).toBe(false);
    expect(result.error).toContain('Command failed');
  });
});

// ==========================================
// generateConftestWorkspaceValidationCommand
// ==========================================

describe('generateConftestWorkspaceValidationCommand', () => {
  it('should generate basic workspace validation command', () => {
    const params = parseWorkspaceValidationParams({ workspaceFolder: 'my-workspace' });
    const result = generateConftestWorkspaceValidationCommand(params);

    expect(result.command).toBe('conftest');
    expect(result.args).toContain('test');
    expect(result.args).toContain('--all-namespaces');
    expect(result.args).toContain('--output');
    expect(result.args).toContain('json');
    expect(result.args).toContain('.');
    expect(result.workspaceFolder).toBe('my-workspace');
    expect(result.workingDirectory).toBeDefined();
  });

  it('should use default "all" policy set', () => {
    const params = parseWorkspaceValidationParams({ workspaceFolder: 'test' });
    const result = generateConftestWorkspaceValidationCommand(params);

    expect(result.args).toContain('-p');
    expect(result.args).toContain('./policy');
    expect(result.policySet).toBe('all');
  });

  it('should use Azure-Proactive-Resiliency-Library-v2 policy path', () => {
    const params = parseWorkspaceValidationParams({
      workspaceFolder: 'test',
      policySet: 'Azure-Proactive-Resiliency-Library-v2',
    });
    const result = generateConftestWorkspaceValidationCommand(params);

    expect(result.args).toContain('./policy/Azure-Proactive-Resiliency-Library-v2');
  });

  it('should use avmsec policy path', () => {
    const params = parseWorkspaceValidationParams({
      workspaceFolder: 'test',
      policySet: 'avmsec',
    });
    const result = generateConftestWorkspaceValidationCommand(params);

    expect(result.args).toContain('./policy/avmsec');
  });

  it('should add severity filter file for avmsec', () => {
    const params = parseWorkspaceValidationParams({
      workspaceFolder: 'test',
      policySet: 'avmsec',
      severityFilter: 'high',
    });
    const result = generateConftestWorkspaceValidationCommand(params);

    expect(result.args).toContain('.conftest_severity_high.rego');
  });

  it('should not add severity filter for non-avmsec policy set', () => {
    const params = parseWorkspaceValidationParams({
      workspaceFolder: 'test',
      policySet: 'all',
      severityFilter: 'high',
    });
    const result = generateConftestWorkspaceValidationCommand(params);

    expect(result.args).not.toContain('.conftest_severity_high.rego');
  });

  it('should add custom policies', () => {
    const params = parseWorkspaceValidationParams({
      workspaceFolder: 'test',
      customPolicies: '/path/to/policy1,/path/to/policy2',
    });
    const result = generateConftestWorkspaceValidationCommand(params);

    expect(result.args).toContain('/path/to/policy1');
    expect(result.args).toContain('/path/to/policy2');
  });
});

// ==========================================
// generateConftestWorkspacePlanValidationCommand
// ==========================================

describe('generateConftestWorkspacePlanValidationCommand', () => {
  it('should generate basic plan validation command', () => {
    const params = parsePlanValidationParams({ folderName: 'my-folder' });
    const result = generateConftestWorkspacePlanValidationCommand(params);

    expect(result.command).toBe('conftest');
    expect(result.args).toContain('test');
    expect(result.args).toContain('--all-namespaces');
    expect(result.args).toContain('--output');
    expect(result.args).toContain('json');
    expect(result.args).toContain('tfplan.json');
    expect(result.workspaceFolder).toBe('my-folder');
    expect(result.workingDirectory).toBeDefined();
  });

  it('should use default "all" policy set', () => {
    const params = parsePlanValidationParams({ folderName: 'test' });
    const result = generateConftestWorkspacePlanValidationCommand(params);

    expect(result.args).toContain('-p');
    expect(result.args).toContain('./policy');
    expect(result.policySet).toBe('all');
  });

  it('should use avmsec policy path with severity filter', () => {
    const params = parsePlanValidationParams({
      folderName: 'test',
      policySet: 'avmsec',
      severityFilter: 'medium',
    });
    const result = generateConftestWorkspacePlanValidationCommand(params);

    expect(result.args).toContain('./policy/avmsec');
    expect(result.args).toContain('.conftest_severity_medium.rego');
  });

  it('should add custom policies', () => {
    const params = parsePlanValidationParams({
      folderName: 'test',
      customPolicies: '/custom/policy',
    });
    const result = generateConftestWorkspacePlanValidationCommand(params);

    expect(result.args).toContain('/custom/policy');
  });

  it('should validate against plan file (tfplan.json)', () => {
    const params = parsePlanValidationParams({ folderName: 'test' });
    const result = generateConftestWorkspacePlanValidationCommand(params);

    const lastArg = result.args[result.args.length - 1];
    expect(lastArg).toBe('tfplan.json');
  });
});
