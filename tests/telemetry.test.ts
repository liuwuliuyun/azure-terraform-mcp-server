/**
 * Tests for core/telemetry.ts
 *
 * Validates that the OpenTelemetry SDK is properly wired up with
 * AzureMonitorMetricExporter so that metrics actually reach
 * Application Insights.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TelemetryConfig } from '../src/core/config.js';

// ==========================================
// Mock objects used to verify OTel wiring
// ==========================================

const mockCounterAdd = vi.fn();
const mockHistogramRecord = vi.fn();
const mockForceFlush = vi.fn().mockResolvedValue(undefined);
const mockShutdown = vi.fn().mockResolvedValue(undefined);

const mockCounter = { add: mockCounterAdd };
const mockHistogram = { record: mockHistogramRecord };

const mockMeter = {
  createCounter: vi.fn().mockReturnValue(mockCounter),
  createHistogram: vi.fn().mockReturnValue(mockHistogram),
};

const mockMeterProvider = {
  getMeter: vi.fn().mockReturnValue(mockMeter),
  forceFlush: mockForceFlush,
  shutdown: mockShutdown,
};

// Vitest 4 requires constructor mocks to use `function` keyword
const MockMeterProvider = vi.fn(function () { return mockMeterProvider; });
const MockPeriodicExportingMetricReader = vi.fn(function () { return {}; });
const MockAzureMonitorMetricExporter = vi.fn(function () { return {}; });
const mockResourceFromAttributes = vi.fn().mockReturnValue({ attributes: {} });

// ==========================================
// Mock dynamic imports used inside telemetry.ts
// ==========================================

vi.mock('@azure/monitor-opentelemetry-exporter', () => ({
  AzureMonitorMetricExporter: MockAzureMonitorMetricExporter,
}));

vi.mock('@opentelemetry/sdk-metrics', () => ({
  MeterProvider: MockMeterProvider,
  PeriodicExportingMetricReader: MockPeriodicExportingMetricReader,
}));

vi.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: mockResourceFromAttributes,
}));

// ==========================================
// Helper: default telemetry config
// ==========================================

function makeTelemetryConfig(overrides: Partial<TelemetryConfig> = {}): TelemetryConfig {
  return {
    enabled: true,
    connectionString: 'InstrumentationKey=test-key;IngestionEndpoint=https://example.com/',
    sampleRate: 1.0,
    userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    flushOnShutdown: true,
    exportIntervalMs: 60000,
    ...overrides,
  };
}

// ==========================================
// Tests
// ==========================================

describe('telemetry', () => {
  // We re-import the module fresh for every test so the singleton
  // is reset (TelemetryManager.instance is module-scoped).
  let initTelemetry: typeof import('../src/core/telemetry.js').initTelemetry;
  let trackToolCall: typeof import('../src/core/telemetry.js').trackToolCall;
  let trackUserActivity: typeof import('../src/core/telemetry.js').trackUserActivity;
  let shutdownTelemetry: typeof import('../src/core/telemetry.js').shutdownTelemetry;
  let getTelemetryManager: typeof import('../src/core/telemetry.js').getTelemetryManager;
  let wrapToolWithTelemetry: typeof import('../src/core/telemetry.js').wrapToolWithTelemetry;
  let wrapToolCallSync: typeof import('../src/core/telemetry.js').wrapToolCallSync;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Re-import so we get a fresh TelemetryManager singleton
    const mod = await import('../src/core/telemetry.js');
    initTelemetry = mod.initTelemetry;
    trackToolCall = mod.trackToolCall;
    trackUserActivity = mod.trackUserActivity;
    shutdownTelemetry = mod.shutdownTelemetry;
    getTelemetryManager = mod.getTelemetryManager;
    wrapToolWithTelemetry = mod.wrapToolWithTelemetry;
    wrapToolCallSync = mod.wrapToolCallSync;
  });

  afterEach(async () => {
    // Best-effort shutdown to avoid timer leaks
    try {
      await shutdownTelemetry();
    } catch {
      // ignore
    }
  });

  // ------------------------------------------
  // Initialization
  // ------------------------------------------

  describe('initTelemetry', () => {
    it('should create AzureMonitorMetricExporter with the configured connection string', async () => {
      const config = makeTelemetryConfig();
      await initTelemetry(config);

      expect(MockAzureMonitorMetricExporter).toHaveBeenCalledWith({
        connectionString: config.connectionString,
      });
    });

    it('should create a PeriodicExportingMetricReader with the configured interval', async () => {
      const config = makeTelemetryConfig({ exportIntervalMs: 30000 });
      await initTelemetry(config);

      expect(MockPeriodicExportingMetricReader).toHaveBeenCalledWith(
        expect.objectContaining({ exportIntervalMillis: 30000 })
      );
    });

    it('should build a Resource with service name and version', async () => {
      await initTelemetry(makeTelemetryConfig());

      expect(mockResourceFromAttributes).toHaveBeenCalledWith({
        'service.name': 'azure-terraform-mcp-server',
        'service.version': '1.0.0',
      });
    });

    it('should create a MeterProvider with the resource and reader', async () => {
      await initTelemetry(makeTelemetryConfig());

      expect(MockMeterProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          readers: expect.any(Array),
        })
      );
    });

    it('should create the expected OTel instruments', async () => {
      await initTelemetry(makeTelemetryConfig());

      expect(mockMeter.createCounter).toHaveBeenCalledWith('tool_calls_total', expect.any(Object));
      expect(mockMeter.createCounter).toHaveBeenCalledWith('tool_errors_total', expect.any(Object));
      expect(mockMeter.createCounter).toHaveBeenCalledWith('user_activity', expect.any(Object));
      expect(mockMeter.createHistogram).toHaveBeenCalledWith('tool_duration_ms', expect.objectContaining({ unit: 'ms' }));
    });

    it('should mark telemetry as enabled after successful init', async () => {
      await initTelemetry(makeTelemetryConfig());

      expect(getTelemetryManager().isEnabled()).toBe(true);
    });

    it('should not enable telemetry when config.enabled is false', async () => {
      await initTelemetry(makeTelemetryConfig({ enabled: false }));

      expect(getTelemetryManager().isEnabled()).toBe(false);
      expect(MockAzureMonitorMetricExporter).not.toHaveBeenCalled();
    });

    it('should not enable telemetry when connection string is empty', async () => {
      await initTelemetry(makeTelemetryConfig({ connectionString: '' }));

      expect(getTelemetryManager().isEnabled()).toBe(false);
      expect(MockAzureMonitorMetricExporter).not.toHaveBeenCalled();
    });

    it('should only initialize once (idempotent)', async () => {
      const config = makeTelemetryConfig();
      await initTelemetry(config);
      await initTelemetry(config);

      // MeterProvider should be constructed exactly once
      expect(MockMeterProvider).toHaveBeenCalledTimes(1);
    });
  });

  // ------------------------------------------
  // trackToolCall
  // ------------------------------------------

  describe('trackToolCall', () => {
    beforeEach(async () => {
      await initTelemetry(makeTelemetryConfig());
      vi.clearAllMocks(); // clear init-phase calls so we isolate tracking calls
    });

    it('should increment tool_calls_total counter', () => {
      trackToolCall('get_azurerm_docs', 42.5, true);

      expect(mockCounterAdd).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          'tool.name': 'get_azurerm_docs',
          'tool.success': 'true',
        })
      );
    });

    it('should record duration in the histogram', () => {
      trackToolCall('get_azurerm_docs', 123.45, true);

      expect(mockHistogramRecord).toHaveBeenCalledWith(
        123.45,
        expect.objectContaining({ 'tool.name': 'get_azurerm_docs' })
      );
    });

    it('should include user.id in attributes', () => {
      trackToolCall('get_azurerm_docs', 10, true);

      expect(mockCounterAdd).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          'user.id': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        })
      );
    });

    it('should increment tool_errors_total on failure', () => {
      trackToolCall('get_azurerm_docs', 10, false, 'TimeoutError');

      // tool_calls_total + tool_errors_total = 2 counter adds
      const errorCall = mockCounterAdd.mock.calls.find(
        (args: unknown[]) =>
          (args[1] as Record<string, string>)?.['error.type'] === 'TimeoutError' &&
          (args[1] as Record<string, string>)?.['tool.success'] === 'false'
      );
      expect(errorCall).toBeDefined();
    });

    it('should not increment tool_errors_total on success', () => {
      trackToolCall('get_azurerm_docs', 10, true);

      // Only 1 counter add call (tool_calls_total), no error counter
      expect(mockCounterAdd).toHaveBeenCalledTimes(1);
    });

    it('should include custom attributes', () => {
      trackToolCall('get_azurerm_docs', 10, true, undefined, {
        'resource.type': 'azurerm_resource_group',
      });

      expect(mockCounterAdd).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          'resource.type': 'azurerm_resource_group',
        })
      );
    });

    it('should not throw when telemetry is disabled', async () => {
      // Re-init fresh module with disabled telemetry
      vi.resetModules();
      vi.clearAllMocks();
      const mod = await import('../src/core/telemetry.js');
      await mod.initTelemetry(makeTelemetryConfig({ enabled: false }));

      // These should silently no-op
      expect(() => mod.trackToolCall('test', 10, true)).not.toThrow();
      expect(mockCounterAdd).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------
  // trackUserActivity
  // ------------------------------------------

  describe('trackUserActivity', () => {
    beforeEach(async () => {
      await initTelemetry(makeTelemetryConfig());
      vi.clearAllMocks();
    });

    it('should increment user_activity counter with user.id', () => {
      trackUserActivity();

      expect(mockCounterAdd).toHaveBeenCalledWith(1, {
        'user.id': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        'event.type': 'activity',
      });
    });

    it('should not throw when telemetry is disabled', async () => {
      vi.resetModules();
      vi.clearAllMocks();
      const mod = await import('../src/core/telemetry.js');
      await mod.initTelemetry(makeTelemetryConfig({ enabled: false }));

      expect(() => mod.trackUserActivity()).not.toThrow();
      expect(mockCounterAdd).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------
  // shutdownTelemetry
  // ------------------------------------------

  describe('shutdownTelemetry', () => {
    it('should call forceFlush on the MeterProvider', async () => {
      await initTelemetry(makeTelemetryConfig());

      await shutdownTelemetry();

      expect(mockForceFlush).toHaveBeenCalled();
    });

    it('should call shutdown on the MeterProvider', async () => {
      await initTelemetry(makeTelemetryConfig());

      await shutdownTelemetry();

      expect(mockShutdown).toHaveBeenCalled();
    });

    it('should flush before shutting down (order matters)', async () => {
      await initTelemetry(makeTelemetryConfig());
      const callOrder: string[] = [];
      mockForceFlush.mockImplementation(() => { callOrder.push('flush'); return Promise.resolve(); });
      mockShutdown.mockImplementation(() => { callOrder.push('shutdown'); return Promise.resolve(); });

      await shutdownTelemetry();

      expect(callOrder).toEqual(['flush', 'shutdown']);
    });

    it('should mark telemetry as disabled after shutdown', async () => {
      await initTelemetry(makeTelemetryConfig());
      expect(getTelemetryManager().isEnabled()).toBe(true);

      await shutdownTelemetry();

      expect(getTelemetryManager().isEnabled()).toBe(false);
    });

    it('should not throw when telemetry was never enabled', async () => {
      await initTelemetry(makeTelemetryConfig({ enabled: false }));

      await expect(shutdownTelemetry()).resolves.not.toThrow();
      expect(mockForceFlush).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------
  // wrapToolWithTelemetry (async wrapper)
  // ------------------------------------------

  describe('wrapToolWithTelemetry', () => {
    beforeEach(async () => {
      await initTelemetry(makeTelemetryConfig());
      vi.clearAllMocks();
    });

    it('should return the result of the wrapped function', async () => {
      const fn = vi.fn().mockResolvedValue('hello');
      const wrapped = wrapToolWithTelemetry('my_tool')(fn);

      const result = await wrapped();

      expect(result).toBe('hello');
    });

    it('should record a successful tool call', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const wrapped = wrapToolWithTelemetry('my_tool')(fn);

      await wrapped();

      expect(mockCounterAdd).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          'tool.name': 'my_tool',
          'tool.success': 'true',
        })
      );
    });

    it('should record duration in histogram', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const wrapped = wrapToolWithTelemetry('my_tool')(fn);

      await wrapped();

      expect(mockHistogramRecord).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ 'tool.name': 'my_tool' })
      );
    });

    it('should record an error tool call and re-throw', async () => {
      const fn = vi.fn().mockRejectedValue(new TypeError('bad'));
      const wrapped = wrapToolWithTelemetry('my_tool')(fn);

      await expect(wrapped()).rejects.toThrow('bad');

      expect(mockCounterAdd).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          'tool.name': 'my_tool',
          'tool.success': 'false',
        })
      );
    });
  });

  // ------------------------------------------
  // wrapToolCallSync (sync wrapper)
  // ------------------------------------------

  describe('wrapToolCallSync', () => {
    beforeEach(async () => {
      await initTelemetry(makeTelemetryConfig());
      vi.clearAllMocks();
    });

    it('should return the result of the wrapped function', () => {
      const fn = vi.fn().mockReturnValue(42);
      const wrapped = wrapToolCallSync('my_sync_tool')(fn);

      expect(wrapped()).toBe(42);
    });

    it('should record a successful tool call', () => {
      const fn = vi.fn().mockReturnValue(42);
      const wrapped = wrapToolCallSync('my_sync_tool')(fn);

      wrapped();

      expect(mockCounterAdd).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          'tool.name': 'my_sync_tool',
          'tool.success': 'true',
        })
      );
    });

    it('should record an error tool call and re-throw', () => {
      const fn = vi.fn().mockImplementation(() => { throw new RangeError('oops'); });
      const wrapped = wrapToolCallSync('my_sync_tool')(fn);

      expect(() => wrapped()).toThrow('oops');

      expect(mockCounterAdd).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          'tool.name': 'my_sync_tool',
          'tool.success': 'false',
        })
      );
    });
  });
});
