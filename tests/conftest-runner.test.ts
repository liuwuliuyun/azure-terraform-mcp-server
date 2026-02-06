/**
 * Tests for tools/conftest-runner.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import {
  checkConftestInstallation,
  runConftestWorkspaceValidation,
  runConftestWorkspacePlanValidation,
} from '../src/tools/conftest-runner.js';
import {
  RunConftestWorkspaceValidationParams,
  RunConftestWorkspacePlanValidationParams,
} from '../src/core/types.js';
import { createTempDir, cleanupTempDir, createFile, SAMPLE_TF_CONTENT } from './helpers.js';

// ==========================================
// Mock Setup
// ==========================================

vi.mock('../src/core/utils.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/core/utils.js')>();
  return {
    ...original,
    isCommandAvailable: vi.fn(),
    getCommandVersion: vi.fn(),
    executeCommand: vi.fn(),
    resolveWorkspacePath: vi.fn((path?: string | null) => path ?? ''),
    stripAnsiEscapeSequences: (str: string) => str,
    getDockerPathTip: () => '',
    CONFTEST_INSTALLATION_HELP: 'Install conftest from https://conftest.dev',
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

// Helper functions to parse params with defaults applied
function parseWorkspaceValidationParams(input: { workspaceFolder: string; [key: string]: unknown }) {
  return RunConftestWorkspaceValidationParams.parse(input);
}

function parsePlanValidationParams(input: { folderName: string; [key: string]: unknown }) {
  return RunConftestWorkspacePlanValidationParams.parse(input);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveWorkspacePath.mockImplementation((path?: string | null) => path ?? '');
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
// runConftestWorkspaceValidation - Input Validation
// ==========================================

describe('runConftestWorkspaceValidation', () => {
  describe('input validation', () => {
    it('should return error for empty workspace folder', async () => {
      const params = parseWorkspaceValidationParams({ workspaceFolder: '' });
      const result = await runConftestWorkspaceValidation(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No workspace folder provided');
    });

    it('should return error for whitespace-only workspace folder', async () => {
      const params = parseWorkspaceValidationParams({ workspaceFolder: '   ' });
      const result = await runConftestWorkspaceValidation(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No workspace folder provided');
    });

    it('should return error for non-existent workspace folder', async () => {
      mockResolveWorkspacePath.mockReturnValue('/nonexistent/path');
      const params = parseWorkspaceValidationParams({ workspaceFolder: 'nonexistent' });
      const result = await runConftestWorkspaceValidation(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });
  });

  describe('terraform files check', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir('conftest-tf-');
      mockResolveWorkspacePath.mockReturnValue(tempDir);
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    it('should return error when no .tf files found', async () => {
      // Create a directory without .tf files
      createFile(tempDir, 'readme.txt', 'This is not a terraform file');

      const params = parseWorkspaceValidationParams({ workspaceFolder: tempDir });
      const result = await runConftestWorkspaceValidation(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No .tf files found');
    });
  });
});

// ==========================================
// runConftestWorkspacePlanValidation - Input Validation
// ==========================================

describe('runConftestWorkspacePlanValidation', () => {
  describe('input validation', () => {
    it('should return error for empty folder name', async () => {
      const params = parsePlanValidationParams({ folderName: '' });
      const result = await runConftestWorkspacePlanValidation(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No folder name provided');
    });

    it('should return error for whitespace-only folder name', async () => {
      const params = parsePlanValidationParams({ folderName: '   ' });
      const result = await runConftestWorkspacePlanValidation(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No folder name provided');
    });

    it('should return error for non-existent folder', async () => {
      mockResolveWorkspacePath.mockReturnValue('/nonexistent/path');
      const params = parsePlanValidationParams({ folderName: 'nonexistent' });
      const result = await runConftestWorkspacePlanValidation(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });
  });

  describe('plan file check', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir('conftest-plan-');
      mockResolveWorkspacePath.mockReturnValue(tempDir);
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    it('should return error when no plan file found', async () => {
      // Create a directory without plan files
      createFile(tempDir, 'main.tf', SAMPLE_TF_CONTENT);

      const params = parsePlanValidationParams({ folderName: tempDir });
      const result = await runConftestWorkspacePlanValidation(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No plan file found');
    });
  });
});

// ==========================================
// Severity Exception Generation
// ==========================================

describe('severity exception generation', () => {
  it('should accept high severity filter', async () => {
    mockResolveWorkspacePath.mockReturnValue('/nonexistent');
    const params = parseWorkspaceValidationParams({
      workspaceFolder: 'test',
      policySet: 'avmsec',
      severityFilter: 'high',
    });
    const result = await runConftestWorkspaceValidation(params);

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('severity');
  });

  it('should accept medium severity filter', async () => {
    mockResolveWorkspacePath.mockReturnValue('/nonexistent');
    const params = parseWorkspaceValidationParams({
      workspaceFolder: 'test',
      policySet: 'avmsec',
      severityFilter: 'medium',
    });
    const result = await runConftestWorkspaceValidation(params);

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('severity');
  });

  it('should accept low severity filter', async () => {
    mockResolveWorkspacePath.mockReturnValue('/nonexistent');
    const params = parseWorkspaceValidationParams({
      workspaceFolder: 'test',
      policySet: 'avmsec',
      severityFilter: 'low',
    });
    const result = await runConftestWorkspaceValidation(params);

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('severity');
  });
});

// ==========================================
// Result Parsing
// ==========================================

describe('conftest output parsing', () => {
  it('should return proper summary structure on validation failure', async () => {
    const params = parseWorkspaceValidationParams({ workspaceFolder: '' });
    const result = await runConftestWorkspaceValidation(params);

    expect(result.summary).toBeDefined();
    expect(result.summary.totalViolations).toBeDefined();
    expect(result.summary.failures).toBeDefined();
    expect(result.summary.warnings).toBeDefined();
  });

  it('should return empty violations array on input error', async () => {
    const params = parseWorkspaceValidationParams({ workspaceFolder: '' });
    const result = await runConftestWorkspaceValidation(params);

    expect(result.violations).toEqual([]);
  });
});

// ==========================================
// Policy Set Handling
// ==========================================

describe('policy set handling', () => {
  it('should accept all policy set', async () => {
    mockResolveWorkspacePath.mockReturnValue('/nonexistent');
    const params = parseWorkspaceValidationParams({
      workspaceFolder: 'test',
      policySet: 'all',
    });
    const result = await runConftestWorkspaceValidation(params);

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('policy set');
  });

  it('should accept Azure-Proactive-Resiliency-Library-v2 policy set', async () => {
    mockResolveWorkspacePath.mockReturnValue('/nonexistent');
    const params = parseWorkspaceValidationParams({
      workspaceFolder: 'test',
      policySet: 'Azure-Proactive-Resiliency-Library-v2',
    });
    const result = await runConftestWorkspaceValidation(params);

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('policy set');
  });

  it('should accept avmsec policy set', async () => {
    mockResolveWorkspacePath.mockReturnValue('/nonexistent');
    const params = parseWorkspaceValidationParams({
      workspaceFolder: 'test',
      policySet: 'avmsec',
    });
    const result = await runConftestWorkspaceValidation(params);

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('policy set');
  });
});

// ==========================================
// Custom Policies
// ==========================================

describe('custom policies', () => {
  it('should accept custom policies parameter', async () => {
    mockResolveWorkspacePath.mockReturnValue('/nonexistent');
    const params = parseWorkspaceValidationParams({
      workspaceFolder: 'test',
      customPolicies: '/path/to/policy1,/path/to/policy2',
    });
    const result = await runConftestWorkspaceValidation(params);

    expect(result.success).toBe(false);
  });

  it('should handle empty custom policies string', async () => {
    mockResolveWorkspacePath.mockReturnValue('/nonexistent');
    const params = parseWorkspaceValidationParams({
      workspaceFolder: 'test',
      customPolicies: '',
    });
    const result = await runConftestWorkspaceValidation(params);

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('custom');
  });
});

// ==========================================
// Error Handling
// ==========================================

describe('error handling', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir('conftest-err-');
    createFile(tempDir, 'main.tf', SAMPLE_TF_CONTENT);
    mockResolveWorkspacePath.mockReturnValue(tempDir);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should handle terraform init failure', async () => {
    mockExecuteCommand
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'Cloned',
        stderr: '',
        command: 'git clone',
      })
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'Terraform init failed',
        command: 'terraform init',
      });

    const params = parseWorkspaceValidationParams({ workspaceFolder: tempDir });
    const result = await runConftestWorkspaceValidation(params);

    expect(result.success).toBe(false);
    expect(result.error).toContain('init failed');
  });

  it('should handle terraform plan failure', async () => {
    mockExecuteCommand
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'Cloned',
        stderr: '',
        command: 'git clone',
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'Initialized',
        stderr: '',
        command: 'terraform init',
      })
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'Planning failed: missing credentials',
        command: 'terraform plan',
      });

    const params = parseWorkspaceValidationParams({ workspaceFolder: tempDir });
    const result = await runConftestWorkspaceValidation(params);

    expect(result.success).toBe(false);
    expect(result.error).toContain('plan failed');
  });

  it('should handle terraform show failure', async () => {
    mockExecuteCommand
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'Cloned',
        stderr: '',
        command: 'git clone',
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'Initialized',
        stderr: '',
        command: 'terraform init',
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'Plan created',
        stderr: '',
        command: 'terraform plan',
      })
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'Failed to show plan',
        command: 'terraform show',
      });

    const params = parseWorkspaceValidationParams({ workspaceFolder: tempDir });
    const result = await runConftestWorkspaceValidation(params);

    expect(result.success).toBe(false);
    expect(result.error).toContain('show failed');
  });
});

// ==========================================
// Workspace Validation Result Structure
// ==========================================

describe('validation result structure', () => {
  it('should include workspace folder in error result', async () => {
    const tempDir = createTempDir('conftest-struct-');
    mockResolveWorkspacePath.mockReturnValue(tempDir);

    // Create folder but no .tf files
    createFile(tempDir, 'readme.txt', 'test');

    const params = parseWorkspaceValidationParams({ workspaceFolder: 'my-workspace' });
    const result = await runConftestWorkspaceValidation(params);

    expect(result.workspaceFolder).toBe('my-workspace');

    cleanupTempDir(tempDir);
  });

  it('should have zero violations on error', async () => {
    const params = parseWorkspaceValidationParams({ workspaceFolder: '' });
    const result = await runConftestWorkspaceValidation(params);

    expect(result.violations.length).toBe(0);
    expect(result.summary.totalViolations).toBe(0);
    expect(result.summary.failures).toBe(0);
    expect(result.summary.warnings).toBe(0);
  });
});
