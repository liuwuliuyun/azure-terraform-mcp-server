/**
 * Integration tests for telemetry module.
 *
 * These tests send real metrics to Application Insights using the default
 * connection string from config.  After a forceFlush the exporter should
 * complete without errors, proving the full pipeline works end-to-end.
 *
 * The tests do NOT read back from Application Insights (ingestion delay
 * is typically 2-5 minutes), but they verify:
 *   1. The OTel SDK initialises against the real endpoint.
 *   2. Metrics can be recorded without errors.
 *   3. forceFlush / shutdown complete successfully (HTTP 200 from ingestion).
 *
 * Run with: npm run test:integration
 *
 * Environment variables (all optional – defaults from config.ts are used):
 *   TFMCP_AI_CON_STR       – override the full connection string
 *   AI_KEY                  – override the instrumentation key
 *   AI_INGEST_ENDPOINT      – override the ingestion endpoint
 *   SKIP_TELEMETRY_TESTS    – set to 'true' to skip these tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createConfig, clearConfigCache } from '../../src/core/config.js';
import {
  initTelemetry,
  trackToolCall,
  trackUserActivity,
  flushTelemetry,
  shutdownTelemetry,
  getTelemetryManager,
} from '../../src/core/telemetry.js';
import type { TelemetryConfig } from '../../src/core/config.js';

function shouldSkipTelemetryTests(): boolean {
  return process.env['SKIP_TELEMETRY_TESTS'] === 'true';
}

describe('Telemetry - Integration (real Application Insights)', () => {
  let telemetryConfig: TelemetryConfig;

  beforeAll(() => {
    if (shouldSkipTelemetryTests()) {
      console.warn('⚠️  SKIP_TELEMETRY_TESTS is set – skipping telemetry integration tests');
      return;
    }

    clearConfigCache();
    const config = createConfig();
    telemetryConfig = {
      ...config.telemetry,
      enabled: true,
      // Use a short export interval so periodic flushing kicks in quickly
      exportIntervalMs: 5000,
    };

    console.log(
      `Using connection string ending with …${telemetryConfig.connectionString.slice(-30)}`
    );
  });

  afterAll(async () => {
    // Always try to shut down cleanly so the MeterProvider is released
    try {
      await shutdownTelemetry();
    } catch {
      // ignore
    }
  });

  // ------------------------------------------------------------------
  // 1. Initialisation against the real endpoint
  // ------------------------------------------------------------------

  it('should initialise telemetry against the real Application Insights endpoint', async () => {
    if (shouldSkipTelemetryTests()) return;

    await initTelemetry(telemetryConfig);

    expect(getTelemetryManager().isEnabled()).toBe(true);
  });

  // ------------------------------------------------------------------
  // 2. Record metrics & flush without errors
  // ------------------------------------------------------------------

  it('should record tool call metrics and flush to Application Insights', async () => {
    if (shouldSkipTelemetryTests()) return;

    // Record a handful of realistic tool calls
    trackToolCall('get_azurerm_docs', 123.4, true, undefined, {
      'resource.type': 'azurerm_resource_group',
    });
    trackToolCall('get_azapi_docs', 456.7, true);
    trackToolCall('get_avm_docs', 89.1, false, 'NotFoundError');
    trackToolCall('analyze_terraform', 210.5, true, undefined, {
      'files.count': '3',
    });

    // forceFlush triggers the PeriodicExportingMetricReader to push all
    // buffered data to Application Insights right now.  If the endpoint
    // rejects the payload this will throw.
    await expect(flushTelemetry()).resolves.not.toThrow();
  });

  it('should record user activity and flush to Application Insights', async () => {
    if (shouldSkipTelemetryTests()) return;

    trackUserActivity();
    trackUserActivity();

    await expect(flushTelemetry()).resolves.not.toThrow();
  });

  // ------------------------------------------------------------------
  // 3. Graceful shutdown (flush + shutdown)
  // ------------------------------------------------------------------

  it('should shut down telemetry gracefully without errors', async () => {
    if (shouldSkipTelemetryTests()) return;

    await expect(shutdownTelemetry()).resolves.not.toThrow();

    expect(getTelemetryManager().isEnabled()).toBe(false);
  });
});
