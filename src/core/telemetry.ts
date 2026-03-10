/**
 * Telemetry module for Azure Terraform MCP Server using Azure Monitor Exporter.
 *
 * This module provides telemetry collection for tool usage, performance metrics,
 * and error tracking using Azure Monitor Application Insights.
 *
 * Features:
 * - Tool execution tracking (count, duration, errors)
 * - User activity tracking for MAU (Monthly Active Users) calculation
 * - Metrics exported to Azure Application Insights
 * - Configurable sampling and export intervals
 */

import { performance } from 'node:perf_hooks';
import type { TelemetryConfig } from './config.js';

// ==========================================
// Logging helpers
// ==========================================

/** Whether debug-level telemetry logging is enabled (set MCP_DEBUG=true). */
function isDebug(): boolean {
  return process.env['MCP_DEBUG'] === 'true' || process.env['MCP_DEBUG'] === '1';
}

const LOG_PREFIX = '[telemetry]';

/** Always-on informational log (written to stderr so it doesn't pollute MCP stdio). */
function logInfo(message: string): void {
  console.error(`${LOG_PREFIX} ${message}`);
}

/** Debug log – only emitted when MCP_DEBUG is enabled. */
function logDebug(message: string): void {
  if (isDebug()) {
    console.error(`${LOG_PREFIX} ${message}`);
  }
}

/** Warning log – always emitted. */
function logWarn(message: string): void {
  console.error(`${LOG_PREFIX} ⚠ ${message}`);
}

/** Error log – always emitted, includes the error object. */
function logError(message: string, error?: unknown): void {
  if (error) {
    console.error(`${LOG_PREFIX} ✗ ${message}`, error);
  } else {
    console.error(`${LOG_PREFIX} ✗ ${message}`);
  }
}

// OpenTelemetry instrument type aliases (resolved at runtime via dynamic import)
interface OTelCounter {
  add(value: number, attributes?: Record<string, string>): void;
}
interface OTelHistogram {
  record(value: number, attributes?: Record<string, string>): void;
}

/**
 * Telemetry manager for Azure Monitor integration.
 *
 * Uses OpenTelemetry SDK with AzureMonitorMetricExporter to send
 * metrics (counters / histograms) to Application Insights.
 */
class TelemetryManager {
  private static instance: TelemetryManager;
  private initialized = false;
  private enabled = false;
  private config: TelemetryConfig | null = null;
  private userId: string = '';

  // OpenTelemetry SDK handles
  private meterProvider: { shutdown(): Promise<void>; forceFlush(): Promise<void> } | null = null;

  // Instruments – populated during initialize()
  private toolCallsCounter: OTelCounter | null = null;
  private toolErrorsCounter: OTelCounter | null = null;
  private toolDurationHistogram: OTelHistogram | null = null;
  private userActivityCounter: OTelCounter | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): TelemetryManager {
    if (!TelemetryManager.instance) {
      TelemetryManager.instance = new TelemetryManager();
    }
    return TelemetryManager.instance;
  }

  /**
   * Initialize telemetry with configuration
   */
  async initialize(config: TelemetryConfig): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.config = config;
    this.userId = config.userId;

    if (!config.enabled) {
      logInfo('Telemetry is disabled by configuration (TELEMETRY_ENABLED)');
      return;
    }

    if (!config.connectionString) {
      logWarn('Application Insights connection string not provided – telemetry disabled');
      return;
    }

    logDebug(`Initializing with exportInterval=${config.exportIntervalMs}ms, sampleRate=${config.sampleRate}`);

    try {
      // Dynamic imports for OpenTelemetry packages
      const [
        { AzureMonitorMetricExporter },
        { MeterProvider, PeriodicExportingMetricReader },
        { resourceFromAttributes },
      ] = await Promise.all([
        import('@azure/monitor-opentelemetry-exporter'),
        import('@opentelemetry/sdk-metrics'),
        import('@opentelemetry/resources'),
      ]);

      // Create Azure Monitor metric exporter
      const metricExporter = new AzureMonitorMetricExporter({
        connectionString: config.connectionString,
      });

      // Periodic reader flushes metrics at the configured interval
      const metricReader = new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: config.exportIntervalMs,
      });

      // Build MeterProvider with resource metadata
      const resource = resourceFromAttributes({
        'service.name': 'azure-terraform-mcp-server',
        'service.version': '1.0.0',
      });

      const meterProvider = new MeterProvider({
        resource,
        readers: [metricReader],
      });

      this.meterProvider = meterProvider;

      // Create instruments
      const meter = meterProvider.getMeter('azure-terraform-mcp');

      this.toolCallsCounter = meter.createCounter('tool_calls_total', {
        description: 'Total number of tool calls',
      });

      this.toolErrorsCounter = meter.createCounter('tool_errors_total', {
        description: 'Total number of tool call errors',
      });

      this.toolDurationHistogram = meter.createHistogram('tool_duration_ms', {
        description: 'Tool call duration in milliseconds',
        unit: 'ms',
      });

      this.userActivityCounter = meter.createCounter('user_activity', {
        description: 'User activity events for MAU calculation',
      });

      this.enabled = true;

      logInfo(
        `✓ Initialized – exporting to Application Insights every ${config.exportIntervalMs / 1000}s ` +
        `(user: ${config.userId.substring(0, 8)}…)`
      );
      logDebug(
        `Instruments created: tool_calls_total (counter), tool_errors_total (counter), ` +
        `tool_duration_ms (histogram), user_activity (counter)`
      );
    } catch (error) {
      logError('Failed to initialize telemetry', error);
      this.enabled = false;
    }
  }

  /**
   * Track a tool call with metrics
   */
  trackToolCall(
    toolName: string,
    duration: number,
    success: boolean,
    errorType?: string,
    attributes?: Record<string, unknown>
  ): void {
    if (!this.enabled || !this.config) {
      return;
    }

    try {
      // Prepare attributes as strings
      const attrs: Record<string, string> = {
        'tool.name': toolName,
        'tool.success': String(success),
        'user.id': this.userId,
      };

      if (errorType) {
        attrs['error.type'] = errorType;
      }

      // Add custom attributes
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            attrs[key] = String(value);
          }
        });
      }

      // Record metrics via OpenTelemetry instruments
      this.toolCallsCounter?.add(1, attrs);
      this.toolDurationHistogram?.record(duration, attrs);

      if (!success) {
        this.toolErrorsCounter?.add(1, attrs);
      }

      logInfo(
        `📊 trackToolCall: ${toolName} ${success ? '✓' : '✗'} ${duration.toFixed(2)}ms` +
        (errorType ? ` [${errorType}]` : '')
      );
    } catch (error) {
      logError(`Failed to track tool call "${toolName}"`, error);
    }
  }

  /**
   * Track user activity for MAU calculation
   */
  trackUserActivity(): void {
    if (!this.enabled || !this.config) {
      return;
    }

    try {
      this.userActivityCounter?.add(1, {
        'user.id': this.userId,
        'event.type': 'activity',
      });
      logDebug(`📊 trackUserActivity: user=${this.userId.substring(0, 8)}…`);
    } catch (error) {
      logError('Failed to track user activity', error);
    }
  }

  /**
   * Shutdown telemetry and flush pending data
   */
  async shutdown(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      // Flush and shut down the MeterProvider – this ensures all pending
      // metrics are exported to Application Insights before the process exits.
      if (this.meterProvider) {
        logDebug('Flushing pending metrics before shutdown…');
        await this.meterProvider.forceFlush();
        logDebug('Shutting down MeterProvider…');
        await this.meterProvider.shutdown();
        this.meterProvider = null;
      }

      this.enabled = false;
      logInfo('✓ Telemetry shutdown complete – all pending metrics flushed');
    } catch (error) {
      logError('Error during telemetry shutdown', error);
    }
  }

  /**
   * Flush all pending metrics to Application Insights immediately.
   */
  async flush(): Promise<void> {
    if (!this.enabled || !this.meterProvider) {
      logDebug('flush() called but telemetry is not active – skipped');
      return;
    }
    logDebug('Flushing pending metrics to Application Insights…');
    await this.meterProvider.forceFlush();
    logDebug('✓ Flush complete');
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * Global telemetry manager instance
 */
const telemetryManager = TelemetryManager.getInstance();

/**
 * Initialize telemetry (should be called once at startup)
 */
export async function initTelemetry(config: TelemetryConfig): Promise<void> {
  await telemetryManager.initialize(config);
}

/**
 * Get telemetry manager instance
 */
export function getTelemetryManager(): TelemetryManager {
  return telemetryManager;
}

/**
 * Track a tool execution (wrapper for easy use)
 */
export function trackToolCall(
  toolName: string,
  duration: number,
  success: boolean,
  errorType?: string,
  attributes?: Record<string, unknown>
): void {
  telemetryManager.trackToolCall(toolName, duration, success, errorType, attributes);
}

/**
 * Track user activity
 */
export function trackUserActivity(): void {
  telemetryManager.trackUserActivity();
}

/**
 * Flush all pending metrics without shutting down.
 */
export async function flushTelemetry(): Promise<void> {
  await telemetryManager.flush();
}

/**
 * Shutdown telemetry gracefully
 */
export async function shutdownTelemetry(): Promise<void> {
  await telemetryManager.shutdown();
}

/**
 * Higher-order function decorator for tracking tool calls
 * Usage: const wrappedTool = wrapToolWithTelemetry(toolName)(originalFunction)
 */
export function wrapToolWithTelemetry<T extends (...args: any[]) => Promise<any>>(
  toolName: string
): (fn: T) => T {
  return (fn: T) => {
    return (async (...args: any[]) => {
      const startTime = performance.now();
      let success = true;
      let errorType: string | undefined;

      try {
        const result = await fn(...args);
        return result;
      } catch (error) {
        success = false;
        errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
        throw error;
      } finally {
        const duration = performance.now() - startTime;
        trackToolCall(toolName, duration, success, errorType);
      }
    }) as T;
  };
}

/**
 * Create a sync wrapper for tool calls
 */
export function wrapToolCallSync<T extends (...args: any[]) => any>(
  toolName: string
): (fn: T) => T {
  return (fn: T) => {
    return ((...args: any[]) => {
      const startTime = performance.now();
      let success = true;
      let errorType: string | undefined;

      try {
        return fn(...args);
      } catch (error) {
        success = false;
        errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
        throw error;
      } finally {
        const duration = performance.now() - startTime;
        trackToolCall(toolName, duration, success, errorType);
      }
    }) as T;
  };
}
