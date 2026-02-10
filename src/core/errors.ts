/**
 * Custom error classes for Azure Terraform MCP Server.
 * 
 * These provide structured error handling with proper error codes
 * and contextual information for debugging and logging.
 */

import type { InstallationHelp } from './types.js';

/**
 * Error codes for categorizing errors.
 */
export enum ErrorCode {
  // Configuration errors (1xxx)
  CONFIG_INVALID = 'CONFIG_INVALID',
  CONFIG_MISSING = 'CONFIG_MISSING',
  
  // Workspace errors (2xxx)
  WORKSPACE_NOT_FOUND = 'WORKSPACE_NOT_FOUND',
  WORKSPACE_PATH_OUTSIDE_ROOT = 'WORKSPACE_PATH_OUTSIDE_ROOT',
  
  // Tool installation errors (3xxx)
  TOOL_NOT_INSTALLED = 'TOOL_NOT_INSTALLED',
  TOOL_VERSION_INCOMPATIBLE = 'TOOL_VERSION_INCOMPATIBLE',
  
  // Command execution errors (4xxx)
  COMMAND_FAILED = 'COMMAND_FAILED',
  COMMAND_TIMEOUT = 'COMMAND_TIMEOUT',
  
  // Network errors (5xxx)
  NETWORK_REQUEST_FAILED = 'NETWORK_REQUEST_FAILED',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  
  // Resource errors (6xxx)
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_INVALID = 'RESOURCE_INVALID',
  
  // Module errors (7xxx)
  MODULE_NOT_FOUND = 'MODULE_NOT_FOUND',
  MODULE_VERSION_NOT_FOUND = 'MODULE_VERSION_NOT_FOUND',
  
  // Policy errors (8xxx)
  POLICY_VALIDATION_FAILED = 'POLICY_VALIDATION_FAILED',
  POLICY_NOT_FOUND = 'POLICY_NOT_FOUND',
  
  // Generic errors
  UNKNOWN = 'UNKNOWN',
}

/**
 * Base error class for Azure Terraform MCP Server.
 */
export class McpServerError extends Error {
  public readonly code: ErrorCode;
  public readonly context?: Record<string, unknown>;
  public override readonly cause?: Error;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message);
    this.name = 'McpServerError';
    this.code = code;
    this.context = context;
    this.cause = cause;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Convert error to JSON-serializable object.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }

  /**
   * Create a formatted error message for logging.
   */
  toLogString(): string {
    let msg = `[${this.code}] ${this.message}`;
    if (this.context) {
      msg += ` | Context: ${JSON.stringify(this.context)}`;
    }
    if (this.cause) {
      msg += ` | Cause: ${this.cause.message}`;
    }
    return msg;
  }
}

/**
 * Error thrown when a required tool is not installed.
 */
export class ToolNotInstalledError extends McpServerError {
  public readonly toolName: string;
  public readonly installationHelp?: InstallationHelp;

  constructor(
    toolName: string,
    installationHelp?: InstallationHelp
  ) {
    super(
      `${toolName} is not installed or not available in PATH`,
      ErrorCode.TOOL_NOT_INSTALLED,
      { toolName, installationHelp }
    );
    this.name = 'ToolNotInstalledError';
    this.toolName = toolName;
    this.installationHelp = installationHelp;
  }
}

/**
 * Error thrown when a command execution fails.
 */
export class CommandExecutionError extends McpServerError {
  public readonly command: string;
  public readonly exitCode: number;
  public readonly stdout?: string;
  public readonly stderr?: string;

  constructor(
    command: string,
    exitCode: number,
    stdout?: string,
    stderr?: string
  ) {
    super(
      `Command failed with exit code ${exitCode}: ${command}`,
      ErrorCode.COMMAND_FAILED,
      { command, exitCode }
    );
    this.name = 'CommandExecutionError';
    this.command = command;
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

/**
 * Error thrown when workspace path is invalid.
 */
export class WorkspaceError extends McpServerError {
  public readonly workspacePath: string;

  constructor(
    message: string,
    workspacePath: string,
    code: ErrorCode = ErrorCode.WORKSPACE_NOT_FOUND
  ) {
    super(message, code, { workspacePath });
    this.name = 'WorkspaceError';
    this.workspacePath = workspacePath;
  }
}

/**
 * Error thrown when a resource or module is not found.
 */
export class ResourceNotFoundError extends McpServerError {
  public readonly resourceType: string;
  public readonly resourceId?: string;

  constructor(
    resourceType: string,
    resourceId?: string
  ) {
    super(
      resourceId 
        ? `${resourceType} '${resourceId}' not found`
        : `${resourceType} not found`,
      ErrorCode.RESOURCE_NOT_FOUND,
      { resourceType, resourceId }
    );
    this.name = 'ResourceNotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * Error thrown when a network request fails.
 */
export class NetworkError extends McpServerError {
  public readonly url: string;
  public readonly statusCode?: number;

  constructor(
    message: string,
    url: string,
    statusCode?: number,
    cause?: Error
  ) {
    super(
      message,
      ErrorCode.NETWORK_REQUEST_FAILED,
      { url, statusCode },
      cause
    );
    this.name = 'NetworkError';
    this.url = url;
    this.statusCode = statusCode;
  }
}

/**
 * Error thrown when policy validation fails.
 */
export class PolicyValidationError extends McpServerError {
  public readonly policySet: string;
  public readonly violationCount: number;

  constructor(
    policySet: string,
    violationCount: number,
    message?: string
  ) {
    super(
      message ?? `Policy validation failed with ${violationCount} violation(s)`,
      ErrorCode.POLICY_VALIDATION_FAILED,
      { policySet, violationCount }
    );
    this.name = 'PolicyValidationError';
    this.policySet = policySet;
    this.violationCount = violationCount;
  }
}

/**
 * Helper function to wrap unknown errors in McpServerError.
 */
export function wrapError(error: unknown, context?: Record<string, unknown>): McpServerError {
  if (error instanceof McpServerError) {
    return error;
  }

  if (error instanceof Error) {
    return new McpServerError(
      error.message,
      ErrorCode.UNKNOWN,
      context,
      error
    );
  }

  return new McpServerError(
    String(error),
    ErrorCode.UNKNOWN,
    context
  );
}

/**
 * Extract error message from unknown error type.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
