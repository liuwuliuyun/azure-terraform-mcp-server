/**
 * Tests for core/errors.ts
 */

import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  McpServerError,
  ToolNotInstalledError,
  CommandExecutionError,
  WorkspaceError,
  ResourceNotFoundError,
  NetworkError,
  PolicyValidationError,
  wrapError,
  getErrorMessage,
} from '../src/core/errors.js';

// ==========================================
// ErrorCode enum
// ==========================================

describe('ErrorCode', () => {
  it('should have all expected error codes', () => {
    expect(ErrorCode.CONFIG_INVALID).toBe('CONFIG_INVALID');
    expect(ErrorCode.CONFIG_MISSING).toBe('CONFIG_MISSING');
    expect(ErrorCode.WORKSPACE_NOT_FOUND).toBe('WORKSPACE_NOT_FOUND');
    expect(ErrorCode.WORKSPACE_PATH_OUTSIDE_ROOT).toBe('WORKSPACE_PATH_OUTSIDE_ROOT');
    expect(ErrorCode.TOOL_NOT_INSTALLED).toBe('TOOL_NOT_INSTALLED');
    expect(ErrorCode.TOOL_VERSION_INCOMPATIBLE).toBe('TOOL_VERSION_INCOMPATIBLE');
    expect(ErrorCode.COMMAND_FAILED).toBe('COMMAND_FAILED');
    expect(ErrorCode.COMMAND_TIMEOUT).toBe('COMMAND_TIMEOUT');
    expect(ErrorCode.NETWORK_REQUEST_FAILED).toBe('NETWORK_REQUEST_FAILED');
    expect(ErrorCode.NETWORK_TIMEOUT).toBe('NETWORK_TIMEOUT');
    expect(ErrorCode.RESOURCE_NOT_FOUND).toBe('RESOURCE_NOT_FOUND');
    expect(ErrorCode.RESOURCE_INVALID).toBe('RESOURCE_INVALID');
    expect(ErrorCode.MODULE_NOT_FOUND).toBe('MODULE_NOT_FOUND');
    expect(ErrorCode.MODULE_VERSION_NOT_FOUND).toBe('MODULE_VERSION_NOT_FOUND');
    expect(ErrorCode.POLICY_VALIDATION_FAILED).toBe('POLICY_VALIDATION_FAILED');
    expect(ErrorCode.POLICY_NOT_FOUND).toBe('POLICY_NOT_FOUND');
    expect(ErrorCode.UNKNOWN).toBe('UNKNOWN');
  });
});

// ==========================================
// McpServerError
// ==========================================

describe('McpServerError', () => {
  it('should create error with message only', () => {
    const error = new McpServerError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe(ErrorCode.UNKNOWN);
    expect(error.context).toBeUndefined();
    expect(error.cause).toBeUndefined();
    expect(error.name).toBe('McpServerError');
  });

  it('should create error with all parameters', () => {
    const cause = new Error('Original error');
    const context = { key: 'value' };
    const error = new McpServerError(
      'Test error',
      ErrorCode.CONFIG_INVALID,
      context,
      cause
    );

    expect(error.message).toBe('Test error');
    expect(error.code).toBe(ErrorCode.CONFIG_INVALID);
    expect(error.context).toEqual(context);
    expect(error.cause).toBe(cause);
  });

  it('should be an instance of Error', () => {
    const error = new McpServerError('Test');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(McpServerError);
  });

  describe('toJSON', () => {
    it('should serialize error to JSON', () => {
      const cause = new Error('Cause');
      const error = new McpServerError(
        'Test error',
        ErrorCode.CONFIG_INVALID,
        { foo: 'bar' },
        cause
      );

      const json = error.toJSON();
      expect(json.name).toBe('McpServerError');
      expect(json.code).toBe('CONFIG_INVALID');
      expect(json.message).toBe('Test error');
      expect(json.context).toEqual({ foo: 'bar' });
      expect(json.cause).toBe('Cause');
      expect(typeof json.stack).toBe('string');
    });

    it('should handle missing optional fields', () => {
      const error = new McpServerError('Simple error');
      const json = error.toJSON();

      expect(json.context).toBeUndefined();
      expect(json.cause).toBeUndefined();
    });
  });

  describe('toLogString', () => {
    it('should format error for logging', () => {
      const error = new McpServerError('Test error', ErrorCode.COMMAND_FAILED);
      const logString = error.toLogString();

      expect(logString).toBe('[COMMAND_FAILED] Test error');
    });

    it('should include context in log string', () => {
      const error = new McpServerError(
        'Test error',
        ErrorCode.COMMAND_FAILED,
        { command: 'terraform' }
      );
      const logString = error.toLogString();

      expect(logString).toContain('[COMMAND_FAILED] Test error');
      expect(logString).toContain('Context:');
      expect(logString).toContain('"command":"terraform"');
    });

    it('should include cause in log string', () => {
      const cause = new Error('Original error');
      const error = new McpServerError(
        'Test error',
        ErrorCode.UNKNOWN,
        undefined,
        cause
      );
      const logString = error.toLogString();

      expect(logString).toContain('Cause: Original error');
    });
  });
});

// ==========================================
// ToolNotInstalledError
// ==========================================

describe('ToolNotInstalledError', () => {
  it('should create error with tool name', () => {
    const error = new ToolNotInstalledError('terraform');

    expect(error.message).toBe('terraform is not installed or not available in PATH');
    expect(error.code).toBe(ErrorCode.TOOL_NOT_INSTALLED);
    expect(error.toolName).toBe('terraform');
    expect(error.name).toBe('ToolNotInstalledError');
  });

  it('should include installation help', () => {
    const help = {
      toolName: 'terraform',
      detectedPlatform: 'win32',
      recommendedInstallCommand: 'winget install HashiCorp.Terraform',
      verifyCommand: 'terraform --version',
      documentationUrl: 'https://developer.hashicorp.com/terraform/install',
      pathGuidance: {
        windows: 'If installed via winget, PATH is managed automatically.',
        macos: 'If installed via brew, PATH is managed automatically.',
      },
    };
    const error = new ToolNotInstalledError('terraform', help);

    expect(error.installationHelp).toEqual(help);
    expect(error.context).toEqual({ toolName: 'terraform', installationHelp: help });
  });

  it('should be an instance of McpServerError', () => {
    const error = new ToolNotInstalledError('terraform');
    expect(error).toBeInstanceOf(McpServerError);
  });
});

// ==========================================
// CommandExecutionError
// ==========================================

describe('CommandExecutionError', () => {
  it('should create error with command details', () => {
    const error = new CommandExecutionError(
      'terraform plan',
      1,
      'Success output',
      'Error output'
    );

    expect(error.message).toBe('Command failed with exit code 1: terraform plan');
    expect(error.code).toBe(ErrorCode.COMMAND_FAILED);
    expect(error.command).toBe('terraform plan');
    expect(error.exitCode).toBe(1);
    expect(error.stdout).toBe('Success output');
    expect(error.stderr).toBe('Error output');
    expect(error.name).toBe('CommandExecutionError');
  });

  it('should handle missing stdout/stderr', () => {
    const error = new CommandExecutionError('cmd', 2);

    expect(error.stdout).toBeUndefined();
    expect(error.stderr).toBeUndefined();
  });
});

// ==========================================
// WorkspaceError
// ==========================================

describe('WorkspaceError', () => {
  it('should create error with workspace path', () => {
    const error = new WorkspaceError('Workspace not found', '/path/to/workspace');

    expect(error.message).toBe('Workspace not found');
    expect(error.code).toBe(ErrorCode.WORKSPACE_NOT_FOUND);
    expect(error.workspacePath).toBe('/path/to/workspace');
    expect(error.name).toBe('WorkspaceError');
  });

  it('should allow custom error code', () => {
    const error = new WorkspaceError(
      'Path outside root',
      '/external/path',
      ErrorCode.WORKSPACE_PATH_OUTSIDE_ROOT
    );

    expect(error.code).toBe(ErrorCode.WORKSPACE_PATH_OUTSIDE_ROOT);
  });
});

// ==========================================
// ResourceNotFoundError
// ==========================================

describe('ResourceNotFoundError', () => {
  it('should create error with resource type only', () => {
    const error = new ResourceNotFoundError('Module');

    expect(error.message).toBe('Module not found');
    expect(error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
    expect(error.resourceType).toBe('Module');
    expect(error.resourceId).toBeUndefined();
    expect(error.name).toBe('ResourceNotFoundError');
  });

  it('should create error with resource type and ID', () => {
    const error = new ResourceNotFoundError('Module', 'avm-res-storage');

    expect(error.message).toBe("Module 'avm-res-storage' not found");
    expect(error.resourceId).toBe('avm-res-storage');
  });
});

// ==========================================
// NetworkError
// ==========================================

describe('NetworkError', () => {
  it('should create error with URL', () => {
    const error = new NetworkError('Request failed', 'https://api.example.com');

    expect(error.message).toBe('Request failed');
    expect(error.code).toBe(ErrorCode.NETWORK_REQUEST_FAILED);
    expect(error.url).toBe('https://api.example.com');
    expect(error.statusCode).toBeUndefined();
    expect(error.name).toBe('NetworkError');
  });

  it('should include status code', () => {
    const error = new NetworkError('Not found', 'https://api.example.com', 404);

    expect(error.statusCode).toBe(404);
    expect(error.context).toEqual({ url: 'https://api.example.com', statusCode: 404 });
  });

  it('should include cause', () => {
    const cause = new Error('Connection refused');
    const error = new NetworkError('Failed', 'https://api.example.com', undefined, cause);

    expect(error.cause).toBe(cause);
  });
});

// ==========================================
// PolicyValidationError
// ==========================================

describe('PolicyValidationError', () => {
  it('should create error with policy set and violation count', () => {
    const error = new PolicyValidationError('avmsec', 5);

    expect(error.message).toBe('Policy validation failed with 5 violation(s)');
    expect(error.code).toBe(ErrorCode.POLICY_VALIDATION_FAILED);
    expect(error.policySet).toBe('avmsec');
    expect(error.violationCount).toBe(5);
    expect(error.name).toBe('PolicyValidationError');
  });

  it('should allow custom message', () => {
    const error = new PolicyValidationError('custom', 3, 'Custom error message');

    expect(error.message).toBe('Custom error message');
  });
});

// ==========================================
// wrapError
// ==========================================

describe('wrapError', () => {
  it('should return McpServerError as-is', () => {
    const original = new McpServerError('Original', ErrorCode.CONFIG_INVALID);
    const wrapped = wrapError(original);

    expect(wrapped).toBe(original);
  });

  it('should wrap Error in McpServerError', () => {
    const original = new Error('Standard error');
    const wrapped = wrapError(original);

    expect(wrapped).toBeInstanceOf(McpServerError);
    expect(wrapped.message).toBe('Standard error');
    expect(wrapped.code).toBe(ErrorCode.UNKNOWN);
    expect(wrapped.cause).toBe(original);
  });

  it('should wrap string in McpServerError', () => {
    const wrapped = wrapError('String error');

    expect(wrapped).toBeInstanceOf(McpServerError);
    expect(wrapped.message).toBe('String error');
  });

  it('should include context when provided', () => {
    const wrapped = wrapError(new Error('Test'), { operation: 'fetch' });

    expect(wrapped.context).toEqual({ operation: 'fetch' });
  });

  it('should handle non-Error objects', () => {
    const wrapped = wrapError({ custom: 'object' });

    expect(wrapped).toBeInstanceOf(McpServerError);
    expect(wrapped.message).toBe('[object Object]');
  });
});

// ==========================================
// getErrorMessage
// ==========================================

describe('getErrorMessage', () => {
  it('should extract message from Error', () => {
    const error = new Error('Test error message');
    expect(getErrorMessage(error)).toBe('Test error message');
  });

  it('should extract message from McpServerError', () => {
    const error = new McpServerError('MCP error message');
    expect(getErrorMessage(error)).toBe('MCP error message');
  });

  it('should convert string to message', () => {
    expect(getErrorMessage('String error')).toBe('String error');
  });

  it('should convert number to message', () => {
    expect(getErrorMessage(404)).toBe('404');
  });

  it('should convert object to string', () => {
    expect(getErrorMessage({ error: true })).toBe('[object Object]');
  });

  it('should handle null', () => {
    expect(getErrorMessage(null)).toBe('null');
  });

  it('should handle undefined', () => {
    expect(getErrorMessage(undefined)).toBe('undefined');
  });
});
