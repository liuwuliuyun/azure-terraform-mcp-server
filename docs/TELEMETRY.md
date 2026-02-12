# Telemetry Setup Guide for Azure Terraform MCP Server

This guide explains how telemetry collection is configured and used in the Azure Terraform MCP Server.

## Overview

The server includes built-in telemetry collection for tracking:

- **Monthly Active Users (MAU)** - Unique user identifiers with first-seen timestamps
- **Tool Execution Metrics** - Count and duration for each tool invocation
- **Tool Errors** - Error tracking with exception types and context
- **User Activity** - Session-based activity tracking for analytics

Data is collected and sent to **Azure Application Insights** via connection string configuration.

## Architecture

### Components

1. **`src/core/telemetry.ts`** - Core telemetry manager with metrics collection
2. **`src/core/config.ts`** - Configuration management including telemetry settings
3. **`src/cli.ts`** - Telemetry initialization at server startup
4. **`src/server.ts`** - Tool execution tracking via wrapper handlers

### Data Flow

```
Server Startup
    ↓
Initialize Telemetry from Config
    ↓
Track User Activity (MAU)
    ↓
Register Tools with Telemetry Wrappers
    ↓
Tool Execution
    ↓
Track Metrics (duration, count, errors)
    ↓
Periodic Export to Azure Monitor
    ↓
Graceful Shutdown & Flush
```

## Configuration

### Environment Variables

Configure telemetry using these environment variables:

```bash
# Enable/disable telemetry (default: true)
TELEMETRY_ENABLED=true

# Azure Application Insights connection string (REQUIRED for telemetry)
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=...;IngestionEndpoint=https://...

# Sampling rate: 0.0-1.0 (default: 1.0 = 100%)
# Use sampling to reduce costs in production
TELEMETRY_SAMPLE_RATE=0.5

# Export interval in milliseconds (default: 300000 = 5 minutes)
TELEMETRY_EXPORT_INTERVAL_MS=30000

# Flush telemetry on graceful shutdown (default: true)
TELEMETRY_FLUSH_ON_SHUTDOWN=true

# Enable debug logging of telemetry events
MCP_DEBUG=true
```

### User ID Persistence

The server generates a unique **User ID** (UUID) on first startup and persists it for MAU tracking:

**Default location:**

`~/.tf_mcp_server/.telemetry_config.json`

**Config file format:**

```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "telemetry_enabled": true,
  "first_seen": "2025-02-12T08:20:00Z"
}
```

### Connection String

The connection string format includes:

```
InstrumentationKey={key};IngestionEndpoint={endpoint};LiveEndpoint={live_endpoint};ApplicationId={app_id}
```

**Note**: Connection strings are **not security secrets** - they contain instrumentation keys which are identifiers only, not credentials.

## Metrics Collected

### 1. Tool Execution Count

**Metric:** `tool_calls_total`

**Properties:**
- `tool.name` - Name of the tool invoked
- `tool.success` - Boolean: true/false
- `user.id` - User identifier
- `error.type` - Error class name (if failed)

**Example:**
```
metric: tool_calls_total
value: 1
properties: {
  "tool.name": "get_azurerm_provider_documentation",
  "tool.success": true,
  "user.id": "550e8400-e29b-41d4..."
}
```

### 2. Tool Execution Duration

**Metric:** `tool_duration_ms`

**Properties:** Same as tool_calls_total

**Example:**
```
metric: tool_duration_ms
value: 142.5  # milliseconds
properties: {
  "tool.name": "get_azurerm_provider_documentation",
  "tool.success": true,
  "user.id": "550e8400-e29b-41d4..."
}
```

### 3. Tool Errors

**Metric:** `tool_errors_total`

**Properties:**
- `tool.name` - Tool that failed
- `error.type` - Exception class name
- `user.id` - User identifier
- All other properties from successful execution

**Example:**
```
metric: tool_errors_total
value: 1
properties: {
  "tool.name": "get_azurerm_provider_documentation",
  "error.type": "NetworkError",
  "user.id": "550e8400-e29b-41d4..."
}
```

### 4. User Activity (MAU)

**Metric:** `user_activity`

**Properties:**
- `user.id` - User identifier
- `event.type` - "activity"
- `timestamp` - ISO 8601 timestamp

Tracked on server startup and after each successful tool execution.

## Sampling Strategy

Use sampling to control telemetry volume and costs:

```bash
# Production: Sample 10% of telemetry
TELEMETRY_SAMPLE_RATE=0.1

# Development: Collect everything
TELEMETRY_SAMPLE_RATE=1.0

# High-volume: Sample 1% only critical errors
TELEMETRY_SAMPLE_RATE=0.01
```

**Sampling is applied at:** The metric recording level (consistent unit of work per trace).

## Export Schedule

Telemetry is exported periodically to Azure Monitor:

- **Default interval:** 5 minutes
- **Configurable via:** `TELEMETRY_EXPORT_INTERVAL_MS`
- **Behavior:** Accumulated metrics are batched and sent to Application Insights
- **On shutdown:** Remaining metrics are flushed gracefully

## Querying Telemetry in Azure Portal

### Query: Tool Execution Count by Name

```kusto
customMetrics
| where name == "tool_calls_total"
| summarize call_count = sum(value) by tostring(customDimensions.["tool.name"])
| sort by call_count desc
```

### Query: Tool Execution Duration (P50, P95, P99)

```kusto
customMetrics
| where name == "tool_duration_ms"
| summarize
    avg_duration = avg(value),
    p50 = percentile(value, 50),
    p95 = percentile(value, 95),
    p99 = percentile(value, 99)
    by tostring(customDimensions.["tool.name"])
```

### Query: Tool Error Rates

```kusto
customMetrics
| where name == "tool_calls_total"
| summarize
    total = sum(value),
    failures = sumif(value, tostring(customDimensions.["tool.success"]) == "false")
    by tostring(customDimensions.["tool.name"])
| project tool = customDimensions_0, error_rate = failures * 100.0 / total
```

### Query: Monthly Active Users

```kusto
customMetrics
| where name == "user_activity"
| where customDimensions.["event.type"] == "activity"
| summarize mau = dcount(tostring(customDimensions.["user.id"])) by bin(timestamp, 1d)
```

### Query: Tool Execution Timeline

```kusto
customMetrics
| where name == "tool_calls_total"
| summarize count = sum(value) by bin(timestamp, 5m), tostring(customDimensions.["tool.name"])
| render timechart
```

## Code Examples

### Tracking Tool Execution (Automatic)

All tools are automatically tracked via the `createHandler` wrapper:

```typescript
// In src/server.ts
server.tool(
  'get_azurerm_provider_documentation',
  'Retrieve documentation for a specific AzureRM resource type...',
  GetAzureRMDocumentationParams.shape,
  createHandler('get_azurerm_provider_documentation', getAzureRMProviderDocumentation)
);

// createHandler automatically:
// 1. Measures execution time
// 2. Tracks success/failure
// 3. Records metrics
// 4. Handles errors gracefully
```

### Manual Telemetry Tracking

For custom tracking outside of tools:

```typescript
import { trackToolCall, trackUserActivity } from './core/telemetry';

// Track a custom operation
const startTime = performance.now();
try {
  // ... do work
  const duration = performance.now() - startTime;
  trackToolCall('custom_operation', duration, true);
} catch (error) {
  const duration = performance.now() - startTime;
  trackToolCall(
    'custom_operation',
    duration,
    false,
    error instanceof Error ? error.constructor.name : 'UnknownError'
  );
}

// Track user activity
trackUserActivity();
```

### Accessing Telemetry Manager

```typescript
import { getTelemetryManager } from './core/telemetry';

const telemetry = getTelemetryManager();
console.log(telemetry.isEnabled()); // Check if telemetry is active
```

## Performance Considerations

### Overhead

- **Per-tool tracking:** ~0.5ms overhead (negligible)
- **Periodic export:** Background task, non-blocking
- **Memory:** ~1MB for buffered metrics before export

### Best Practices

1. **Use sampling in production** - Set `TELEMETRY_SAMPLE_RATE < 1.0` to reduce Azure costs
2. **Configure export interval** - Default 60s is good for most scenarios
   - Shorter intervals (10-30s) for real-time monitoring
   - Longer intervals (120-300s) for high-volume scenarios to reduce network I/O
3. **Monitor telemetry health** - Watch for export failures in logs
4. **Graceful shutdown** - Server automatically flushes pending metrics on exit

## Troubleshooting

### Telemetry Not Appearing in Application Insights

**Check 1: Verify connection string**
```bash
echo $APPLICATIONINSIGHTS_CONNECTION_STRING
# Should output: InstrumentationKey=...;IngestionEndpoint=...
```

**Check 2: Enable debug logging**
```bash
MCP_DEBUG=true npm start
# Look for: "✓ Azure Monitor telemetry configured"
```

**Check 3: Verify network connectivity**
```bash
# Azure Monitor endpoint must be reachable
curl https://westeurope-5.in.applicationinsights.azure.com/
```

**Check 4: Review telemetry config**
```bash
cat ~/.tf_mcp_server/.telemetry_config.json
# Verify user_id and telemetry_enabled fields
```

### High Latency in Tool Execution

- Telemetry tracking adds ~0.5ms per tool
- If performance is critical, disable telemetry: `TELEMETRY_ENABLED=false`
- Or use sampling: `TELEMETRY_SAMPLE_RATE=0.1`

### Excessive Azure Monitor Costs

**Solutions:**
1. Enable sampling: `TELEMETRY_SAMPLE_RATE=0.1` (10% of traffic)
2. Increase export interval: `TELEMETRY_EXPORT_INTERVAL_MS=300000` (5 minutes)
3. Disable specific metric tracking if needed (requires code changes)

## Migration from Reference Implementation

This implementation is inspired by the Python reference (`tf-mcp-server`) but optimized for TypeScript/Node.js:

**Key Differences:**
| Aspect | Python Reference | Node.js Implementation |
|--------|------------------|------------------------|
| Framework | OpenTelemetry SDK | Azure Monitor Exporter |
| Decorators | `@track_tool_call` | `createHandler()` wrapper |
| Storage | OpenTelemetry Exporter | In-memory metrics buffer |
| Export | Batch spans | Periodic metrics export |
| Configuration | Pydantic models | TypeScript interfaces |

**Compatible with:** The node.js version sends the same metrics to Azure Application Insights in the same format.

## Future Enhancements

Potential improvements for future versions:

- [ ] OpenTelemetry SDK integration for richer spans
- [ ] Custom event properties (execution context, parameters)
- [ ] Distributed tracing across multiple MCP servers
- [ ] Real-time alerting on error thresholds
- [ ] Per-tool sampling configuration
- [ ] Telemetry processor chain for filtering/enrichment

## References

- [Azure Application Insights Documentation](https://docs.microsoft.com/azure/azure-monitor/app/)
- [Azure Monitor Connection Strings](https://docs.microsoft.com/azure/azure-monitor/app/sdk-connection-string)
- [Kusto Query Language](https://docs.microsoft.com/azure/data-explorer/kusto/query/)
- [Reference Implementation (Python)](https://github.com/liuwuliuyun/tf-mcp-server/blob/main/src/tf_mcp_server/core/telemetry.py)
