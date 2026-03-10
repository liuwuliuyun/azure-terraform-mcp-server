/**
 * Configuration management for Azure Terraform MCP Server
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ==========================================
// Configuration Interfaces
// ==========================================

/**
 * Telemetry configuration for Application Insights.
 */
export interface TelemetryConfig {
  /** Whether telemetry is enabled */
  enabled: boolean;
  /** Application Insights connection string */
  connectionString: string;
  /** Sampling rate (0.0 to 1.0) */
  sampleRate: number;
  /** Unique user identifier for telemetry */
  userId: string;
  /** Whether to flush on shutdown */
  flushOnShutdown: boolean;
  /** Export interval in milliseconds */
  exportIntervalMs: number;
}

/**
 * Server configuration options.
 */
export interface ServerConfig {
  /** GitHub personal access token for API requests */
  githubToken: string;
  /** Host address for the server */
  host: string;
  /** Port number for the server */
  port: number;
  /** Enable debug mode */
  debug: boolean;
  /** Workspace root directory */
  workspaceRoot?: string;
}

/**
 * Azure authentication and subscription configuration.
 */
export interface AzureConfig {
  /** Azure subscription ID */
  subscriptionId?: string;
  /** Azure tenant ID */
  tenantId?: string;
  /** Azure client/application ID */
  clientId?: string;
  /** Azure client secret */
  clientSecret?: string;
}

/**
 * Complete configuration object.
 */
export interface Config {
  /** Server settings */
  server: ServerConfig;
  /** Azure authentication settings */
  azure: AzureConfig;
  /** Telemetry settings */
  telemetry: TelemetryConfig;
}

// ==========================================
// Telemetry Configuration
// ==========================================

interface TelemetryConfigFile {
  user_id: string;
  telemetry_enabled: boolean;
  first_seen?: string;
}

function loadOrGenerateUserId(): string {
  // Store telemetry config in the shared cache root (~/.azure-terraform-mcp/)
  const cacheRoot = join(homedir(), '.azure-terraform-mcp');
  const configFilePath = join(cacheRoot, '.telemetry_config.json');

  // Try to load existing config
  if (existsSync(configFilePath)) {
    try {
      const content = readFileSync(configFilePath, 'utf-8');
      const data = JSON.parse(content) as TelemetryConfigFile;
      if (data.user_id) {
        return data.user_id;
      }
    } catch {
      // Ignore errors, generate new ID
    }
  }

  // Generate new user ID
  const userId = randomUUID();

  // Try to save to file
  try {
    if (!existsSync(cacheRoot)) {
      mkdirSync(cacheRoot, { recursive: true });
    }
    
    const configData: TelemetryConfigFile = {
      user_id: userId,
      telemetry_enabled: true,
      first_seen: new Date().toISOString(),
    };
    
    writeFileSync(configFilePath, JSON.stringify(configData, null, 2));
  } catch {
    // If we can't save, just use the generated ID
  }

  return userId;
}

function createTelemetryConfig(): TelemetryConfig {
  const enabled = ['true', '1', 'yes'].includes(
    (process.env['TELEMETRY_ENABLED'] ?? 'true').toLowerCase()
  );

  const aiKey = process.env['AI_KEY'] ?? 'f20a7f04-a605-4057-a76d-57de0a138abb';
  const aiIngestEndpoint = process.env['AI_INGEST_ENDPOINT'] ?? 'https://westeurope-5.in.applicationinsights.azure.com/';
  const aiLiveEndpoint = process.env['AI_LIVE_ENDPOINT'] ?? 'https://westeurope.livediagnostics.monitor.azure.com/';
  const appId = process.env['APP_ID'] ?? 'e5481343-dfa6-454c-8f50-2eec2d86be0c';

  const defaultConnectionString = 
    `InstrumentationKey=${aiKey};` +
    `IngestionEndpoint=${aiIngestEndpoint};` +
    `LiveEndpoint=${aiLiveEndpoint};` +
    `ApplicationId=${appId}`;

  const connectionString = process.env['TFMCP_AI_CON_STR'] ?? defaultConnectionString;
  const sampleRate = parseFloat(process.env['TELEMETRY_SAMPLE_RATE'] ?? '1.0');
  const userId = loadOrGenerateUserId();
  const flushOnShutdown = ['true', '1', 'yes'].includes(
    (process.env['TELEMETRY_FLUSH_ON_SHUTDOWN'] ?? 'true').toLowerCase()
  );
  const exportIntervalMs = parseInt(process.env['TELEMETRY_EXPORT_INTERVAL_MS'] ?? '60000', 10);

  return {
    enabled,
    connectionString,
    sampleRate,
    userId,
    flushOnShutdown,
    exportIntervalMs,
  };
}

// ==========================================
// Server Configuration
// ==========================================

function createServerConfig(): ServerConfig {
  return {
    githubToken: process.env['GITHUB_TOKEN'] ?? '',
    host: process.env['MCP_SERVER_HOST'] ?? 'localhost',
    port: parseInt(process.env['MCP_SERVER_PORT'] ?? '8000', 10),
    debug: ['true', '1', 'yes'].includes(
      (process.env['MCP_DEBUG'] ?? 'false').toLowerCase()
    ),
  };
}

// ==========================================
// Azure Configuration
// ==========================================

function createAzureConfig(): AzureConfig {
  return {
    subscriptionId: process.env['ARM_SUBSCRIPTION_ID'],
    tenantId: process.env['ARM_TENANT_ID'],
    clientId: process.env['ARM_CLIENT_ID'],
    clientSecret: process.env['ARM_CLIENT_SECRET'],
  };
}

// ==========================================
// Main Config Factory
// ==========================================

let cachedConfig: Config | null = null;

/**
 * Create configuration from environment variables.
 */
export function createConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = {
    server: createServerConfig(),
    azure: createAzureConfig(),
    telemetry: createTelemetryConfig(),
  };

  return cachedConfig;
}

/**
 * Get the current configuration.
 */
export function getConfig(): Config {
  return createConfig();
}

/**
 * Clear cached configuration (useful for testing).
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Load configuration from a JSON file.
 */
export function loadConfigFromFile(filePath: string): Config {
  const content = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content) as Partial<Config>;

  return {
    server: {
      githubToken: data.server?.githubToken ?? '',
      host: data.server?.host ?? 'localhost',
      port: data.server?.port ?? 8000,
      debug: data.server?.debug ?? false,
    },
    azure: {
      subscriptionId: data.azure?.subscriptionId,
      tenantId: data.azure?.tenantId,
      clientId: data.azure?.clientId,
      clientSecret: data.azure?.clientSecret,
    },
    telemetry: {
      enabled: data.telemetry?.enabled ?? true,
      connectionString: data.telemetry?.connectionString ?? '',
      sampleRate: data.telemetry?.sampleRate ?? 1.0,
      userId: data.telemetry?.userId ?? loadOrGenerateUserId(),
      flushOnShutdown: data.telemetry?.flushOnShutdown ?? true,
      exportIntervalMs: data.telemetry?.exportIntervalMs ?? 300000,
    },
  };
}

/**
 * Save configuration to a JSON file.
 */
export function saveConfigToFile(config: Config, filePath: string): void {
  const configDir = dirname(filePath);
  mkdirSync(configDir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(config, null, 2));
}

// ==========================================
// Convenience Getters
// ==========================================

/**
 * Get GitHub token from configuration.
 */
export function getGitHubToken(): string {
  return getConfig().server.githubToken;
}

/**
 * Check if debug mode is enabled.
 */
export function isDebugMode(): boolean {
  return getConfig().server.debug;
}

/**
 * Check if telemetry is enabled.
 */
export function isTelemetryEnabled(): boolean {
  return getConfig().telemetry.enabled;
}

/**
 * Get Azure configuration.
 */
export function getAzureConfig(): AzureConfig {
  return getConfig().azure;
}
