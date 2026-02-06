/**
 * Tests for core/config.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createConfig,
  getConfig,
  clearConfigCache,
  getGitHubToken,
  isDebugMode,
  isTelemetryEnabled,
  getAzureConfig,
  loadConfigFromFile,
  saveConfigToFile,
} from '../src/core/config.js';
import {
  createTempDir,
  cleanupTempDir,
  createFile,
  mockEnv,
} from './helpers.js';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

// ==========================================
// Config Creation and Caching
// ==========================================

describe('createConfig', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    clearConfigCache();
  });

  afterEach(() => {
    restoreEnv?.();
    clearConfigCache();
  });

  it('should create config with default values', () => {
    restoreEnv = mockEnv({
      GITHUB_TOKEN: undefined,
      MCP_SERVER_HOST: undefined,
      MCP_SERVER_PORT: undefined,
      MCP_DEBUG: undefined,
      ARM_SUBSCRIPTION_ID: undefined,
      TELEMETRY_ENABLED: undefined,
    });

    const config = createConfig();

    expect(config.server.githubToken).toBe('');
    expect(config.server.host).toBe('localhost');
    expect(config.server.port).toBe(8000);
    expect(config.server.debug).toBe(false);
    expect(config.telemetry.enabled).toBe(true);
  });

  it('should read server config from environment', () => {
    restoreEnv = mockEnv({
      GITHUB_TOKEN: 'test-token',
      MCP_SERVER_HOST: '0.0.0.0',
      MCP_SERVER_PORT: '9000',
      MCP_DEBUG: 'true',
    });

    const config = createConfig();

    expect(config.server.githubToken).toBe('test-token');
    expect(config.server.host).toBe('0.0.0.0');
    expect(config.server.port).toBe(9000);
    expect(config.server.debug).toBe(true);
  });

  it('should read Azure config from environment', () => {
    restoreEnv = mockEnv({
      ARM_SUBSCRIPTION_ID: 'sub-123',
      ARM_TENANT_ID: 'tenant-456',
      ARM_CLIENT_ID: 'client-789',
      ARM_CLIENT_SECRET: 'secret-abc',
    });

    const config = createConfig();

    expect(config.azure.subscriptionId).toBe('sub-123');
    expect(config.azure.tenantId).toBe('tenant-456');
    expect(config.azure.clientId).toBe('client-789');
    expect(config.azure.clientSecret).toBe('secret-abc');
  });

  it('should parse debug mode from various truthy values', () => {
    const truthyValues = ['true', '1', 'yes', 'TRUE', 'True', 'YES'];

    for (const value of truthyValues) {
      clearConfigCache();
      restoreEnv = mockEnv({ MCP_DEBUG: value });
      const config = createConfig();
      expect(config.server.debug).toBe(true);
      restoreEnv();
    }
  });

  it('should parse debug mode as false for other values', () => {
    const falsyValues = ['false', '0', 'no', 'anything'];

    for (const value of falsyValues) {
      clearConfigCache();
      restoreEnv = mockEnv({ MCP_DEBUG: value });
      const config = createConfig();
      expect(config.server.debug).toBe(false);
      restoreEnv();
    }
  });

  it('should cache config on subsequent calls', () => {
    restoreEnv = mockEnv({ GITHUB_TOKEN: 'cached-token' });

    const config1 = createConfig();
    
    // Change env - should not affect cached config
    restoreEnv();
    restoreEnv = mockEnv({ GITHUB_TOKEN: 'new-token' });

    const config2 = createConfig();
    
    expect(config1).toBe(config2);
    expect(config2.server.githubToken).toBe('cached-token');
  });
});

describe('getConfig', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    clearConfigCache();
  });

  afterEach(() => {
    restoreEnv?.();
    clearConfigCache();
  });

  it('should return the same config as createConfig', () => {
    restoreEnv = mockEnv({ GITHUB_TOKEN: 'test' });
    
    const created = createConfig();
    const gotten = getConfig();

    expect(gotten).toBe(created);
  });
});

describe('clearConfigCache', () => {
  let restoreEnv: () => void;

  afterEach(() => {
    restoreEnv?.();
    clearConfigCache();
  });

  it('should clear cached config', () => {
    restoreEnv = mockEnv({ GITHUB_TOKEN: 'first-token' });
    const config1 = createConfig();

    clearConfigCache();
    restoreEnv();
    restoreEnv = mockEnv({ GITHUB_TOKEN: 'second-token' });

    const config2 = createConfig();

    expect(config1.server.githubToken).toBe('first-token');
    expect(config2.server.githubToken).toBe('second-token');
    expect(config1).not.toBe(config2);
  });
});

// ==========================================
// Convenience Getters
// ==========================================

describe('getGitHubToken', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    clearConfigCache();
  });

  afterEach(() => {
    restoreEnv?.();
    clearConfigCache();
  });

  it('should return GitHub token from config', () => {
    restoreEnv = mockEnv({ GITHUB_TOKEN: 'my-github-token' });
    expect(getGitHubToken()).toBe('my-github-token');
  });

  it('should return empty string when not set', () => {
    restoreEnv = mockEnv({ GITHUB_TOKEN: undefined });
    expect(getGitHubToken()).toBe('');
  });
});

describe('isDebugMode', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    clearConfigCache();
  });

  afterEach(() => {
    restoreEnv?.();
    clearConfigCache();
  });

  it('should return true when debug is enabled', () => {
    restoreEnv = mockEnv({ MCP_DEBUG: 'true' });
    expect(isDebugMode()).toBe(true);
  });

  it('should return false when debug is disabled', () => {
    restoreEnv = mockEnv({ MCP_DEBUG: 'false' });
    expect(isDebugMode()).toBe(false);
  });
});

describe('isTelemetryEnabled', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    clearConfigCache();
  });

  afterEach(() => {
    restoreEnv?.();
    clearConfigCache();
  });

  it('should return true by default', () => {
    restoreEnv = mockEnv({ TELEMETRY_ENABLED: undefined });
    expect(isTelemetryEnabled()).toBe(true);
  });

  it('should return false when disabled', () => {
    restoreEnv = mockEnv({ TELEMETRY_ENABLED: 'false' });
    expect(isTelemetryEnabled()).toBe(false);
  });

  it('should return true when explicitly enabled', () => {
    restoreEnv = mockEnv({ TELEMETRY_ENABLED: 'true' });
    expect(isTelemetryEnabled()).toBe(true);
  });
});

describe('getAzureConfig', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    clearConfigCache();
  });

  afterEach(() => {
    restoreEnv?.();
    clearConfigCache();
  });

  it('should return Azure config', () => {
    restoreEnv = mockEnv({
      ARM_SUBSCRIPTION_ID: 'sub-test',
      ARM_TENANT_ID: 'tenant-test',
    });

    const azure = getAzureConfig();
    expect(azure.subscriptionId).toBe('sub-test');
    expect(azure.tenantId).toBe('tenant-test');
  });
});

// ==========================================
// File Operations
// ==========================================

describe('loadConfigFromFile', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should load config from JSON file', () => {
    const configData = {
      server: {
        githubToken: 'file-token',
        host: '127.0.0.1',
        port: 3000,
        debug: true,
      },
      azure: {
        subscriptionId: 'file-sub',
      },
      telemetry: {
        enabled: false,
        sampleRate: 0.5,
      },
    };

    createFile(tempDir, 'config.json', JSON.stringify(configData));
    const config = loadConfigFromFile(join(tempDir, 'config.json'));

    expect(config.server.githubToken).toBe('file-token');
    expect(config.server.host).toBe('127.0.0.1');
    expect(config.server.port).toBe(3000);
    expect(config.server.debug).toBe(true);
    expect(config.azure.subscriptionId).toBe('file-sub');
    expect(config.telemetry.enabled).toBe(false);
    expect(config.telemetry.sampleRate).toBe(0.5);
  });

  it('should use defaults for missing fields', () => {
    createFile(tempDir, 'partial.json', JSON.stringify({}));
    const config = loadConfigFromFile(join(tempDir, 'partial.json'));

    expect(config.server.githubToken).toBe('');
    expect(config.server.host).toBe('localhost');
    expect(config.server.port).toBe(8000);
    expect(config.server.debug).toBe(false);
    expect(config.telemetry.enabled).toBe(true);
    expect(config.telemetry.sampleRate).toBe(1.0);
  });

  it('should throw for non-existent file', () => {
    expect(() => {
      loadConfigFromFile(join(tempDir, 'nonexistent.json'));
    }).toThrow();
  });

  it('should throw for invalid JSON', () => {
    createFile(tempDir, 'invalid.json', 'not valid json');
    expect(() => {
      loadConfigFromFile(join(tempDir, 'invalid.json'));
    }).toThrow();
  });
});

describe('saveConfigToFile', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should save config to JSON file', () => {
    const config = {
      server: {
        githubToken: 'save-token',
        host: 'localhost',
        port: 8000,
        debug: false,
      },
      azure: {
        subscriptionId: 'save-sub',
      },
      telemetry: {
        enabled: true,
        connectionString: 'test',
        sampleRate: 1.0,
        userId: 'user-123',
      },
    };

    const filePath = join(tempDir, 'saved-config.json');
    saveConfigToFile(config, filePath);

    expect(existsSync(filePath)).toBe(true);
    const savedContent = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(savedContent.server.githubToken).toBe('save-token');
    expect(savedContent.azure.subscriptionId).toBe('save-sub');
  });

  it('should create parent directories if needed', () => {
    const config = {
      server: { githubToken: '', host: 'localhost', port: 8000, debug: false },
      azure: {},
      telemetry: { enabled: true, connectionString: '', sampleRate: 1.0, userId: '' },
    };

    const filePath = join(tempDir, 'nested', 'dir', 'config.json');
    saveConfigToFile(config, filePath);

    expect(existsSync(filePath)).toBe(true);
  });
});

// ==========================================
// Telemetry Config
// ==========================================

describe('TelemetryConfig', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    clearConfigCache();
  });

  afterEach(() => {
    restoreEnv?.();
    clearConfigCache();
  });

  it('should use custom sample rate from environment', () => {
    restoreEnv = mockEnv({ TELEMETRY_SAMPLE_RATE: '0.25' });
    const config = createConfig();
    expect(config.telemetry.sampleRate).toBe(0.25);
  });

  it('should generate a userId', () => {
    restoreEnv = mockEnv({});
    const config = createConfig();
    expect(config.telemetry.userId).toBeDefined();
    expect(config.telemetry.userId.length).toBeGreaterThan(0);
  });
});
