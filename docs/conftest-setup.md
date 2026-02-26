# Conftest Auto-Setup Guide

This document covers the automated Conftest installation and policy setup system, including the API reference, usage examples, error handling, and troubleshooting.

## Overview

The Azure Terraform MCP Server includes a fully automated system for setting up Conftest and Azure policy libraries. Instead of manually installing Conftest and cloning policy repositories, a single `setup_conftest_environment` MCP tool call (or `setupConftestEnvironment()` library call) handles everything:

1. Detects your platform (Windows, macOS, Linux)
2. Finds an available package manager (scoop, choco, brew, apt, dnf, etc.)
3. Installs Conftest with intelligent fallbacks
4. Clones the Azure policy library from GitHub
5. Verifies everything is ready for validation

## Quick Start

### Via MCP Tool

Call the `setup_conftest_environment` tool with:

```json
{
  "confirmInstall": true,
  "workspacePath": "./terraform"
}
```

### Via Library

```typescript
import {
  setupConftestEnvironment,
  installConftest,
  detectPlatform,
  clonePolicyLibrary,
  getPolicyStatus,
} from 'azure-terraform-mcp-server/tools';

const result = await setupConftestEnvironment({
  workspacePath: './terraform',
  confirmInstall: true,
  skipPolicies: false,
});

if (result.readyToValidate) {
  console.log(`Conftest ${result.conftestVersion} ready`);
}
```

## Supported Platforms

| Platform | Package Managers (in order of preference) |
|----------|-------------------------------------------|
| Windows  | scoop → choco → manual download           |
| macOS    | brew → manual download                    |
| Linux    | apt → dnf → brew → manual download        |

The installer tries each available package manager in order and falls back gracefully.

## API Reference

### `setupConftestEnvironment(params)`

Main orchestrator that coordinates the full setup workflow.

**Parameters:**

```typescript
interface SetupParams {
  workspacePath?: string;     // Path to workspace (default: cwd)
  confirmInstall?: boolean;   // Allow installation (default: false)
  skipPolicies?: boolean;     // Skip policy download (default: false)
  verbose?: boolean;          // Show detailed logs (default: false)
}
```

**Returns:** `Promise<SetupEnvironmentResult>`

```typescript
interface SetupEnvironmentResult {
  success: boolean;
  message: string;

  // Installation status
  conftestInstalled: boolean;
  conftestVersion?: string;
  conftestPath?: string;
  installationSteps?: InstallationStepResult[];

  // Policy status
  policiesAvailable: boolean;
  policyStatus?: PolicyLibraryStatus;

  // Actions taken
  actionsTaken: ('conftest-install' | 'policy-clone' | 'policy-update')[];

  // Restart requirement
  requiresRestart: boolean;
  restartInstructions?: string;

  // Readiness
  readyToValidate: boolean;
  nextSteps?: string[];

  // Metadata
  executedAt: Date;
  duration?: number;
}
```

### `checkConftestInstallationWithSetup(workspacePath?, autoSetup?)`

Enhanced installation check with optional auto-setup.

**Parameters:**

| Parameter       | Type      | Default | Description                   |
|-----------------|-----------|---------|-------------------------------|
| `workspacePath` | `string?` | `cwd`   | Workspace path                |
| `autoSetup`     | `boolean` | `false` | Enable automatic setup        |

**Returns:** `Promise<SetupEnvironmentResult>`

### `installConftest(config?)`

Install Conftest using the best available package manager.

**Parameters:**

```typescript
interface InstallerConfig {
  verbose?: boolean;   // Show detailed logs (default: false)
  dryRun?: boolean;    // Preview only (default: false)
  timeout?: number;    // Timeout in ms (default: 120000)
}
```

**Returns:** `Promise<InstallResult>`

```typescript
interface InstallResult {
  success: boolean;
  message: string;
  version?: string;
  path?: string;
  requiresRestart: boolean;
  steps: InstallationStepResult[];
  error?: string;
}
```

### `detectPlatform()`

Returns: `'windows' | 'macos' | 'linux'`

### `detectPackageManagers(platform?)`

Returns: `Promise<PackageManager[]>` — list of package managers with availability info.

### `checkConftestInstalled()`

Returns: `Promise<boolean>`

### `getConftestVersion()`

Returns: `Promise<string | null>`

### Policy Manager Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getPolicyPath(workspacePath)` | `string → string` | Get the policy directory path |
| `clonePolicyLibrary(workspacePath)` | `string → Promise<PolicySetupResult>` | Clone policy repo from GitHub |
| `updatePolicyLibrary(workspacePath)` | `string → Promise<PolicySetupResult>` | Update existing policy repo |
| `verifyPolicyDirectory(policyPath)` | `string → PolicyVerification` | Validate policy directory structure |
| `getPolicyStatus(workspacePath)` | `string → PolicyLibraryStatus` | Check current policy status |

### Cache Manager Functions

The unified cache lives at `~/.azure-terraform-mcp/` with subdirectories for different data types.

| Function | Signature | Description |
|----------|-----------|-------------|
| `getCacheRootPath()` | `→ string` | Get `~/.azure-terraform-mcp` path |
| `getCachePath(type)` | `CacheType → string` | Get type-specific cache path |
| `getCacheFilePath(type, filename)` | `(CacheType, string) → string` | Get path for a specific file |
| `getCacheStatus()` | `→ CacheStatus` | Report cache usage and sizes |
| `clearCache(type)` | `CacheType → boolean` | Clear a specific cache type |
| `clearAllCaches()` | `→ boolean` | Clear all caches |
| `cleanExpiredTempFiles()` | `→ number` | Clean temp files older than 7 days |
| `resetCacheManager()` | `→ void` | Reset internal state (for testing) |

**Cache types:** `'azapi'`, `'avm'`, `'conftest'`, `'temp'`

## Usage Examples

### Full Automatic Setup

```typescript
const result = await setupConftestEnvironment({
  workspacePath: './terraform',
  confirmInstall: true,
  skipPolicies: false,
});

if (result.readyToValidate) {
  // Proceed with validation
} else if (result.requiresRestart) {
  console.log(result.restartInstructions);
}
```

### Check-Only (No Installation)

```typescript
const result = await setupConftestEnvironment({
  workspacePath: './terraform',
  confirmInstall: false,
  skipPolicies: true,
});

if (!result.conftestInstalled) {
  console.log('Conftest not installed. Re-run with confirmInstall=true.');
}
```

### Install Conftest Only (Skip Policies)

```typescript
const result = await setupConftestEnvironment({
  workspacePath: './terraform',
  confirmInstall: true,
  skipPolicies: true,
});
```

### Individual Components

```typescript
import {
  installConftest,
  detectPlatform,
  clonePolicyLibrary,
  getPolicyStatus,
} from 'azure-terraform-mcp-server/tools';

// Platform detection
const platform = detectPlatform(); // 'windows' | 'macos' | 'linux'

// Install conftest directly
const installResult = await installConftest({ verbose: true, timeout: 120000 });

// Policy management
const cloneResult = await clonePolicyLibrary('/path/to/workspace');
const status = getPolicyStatus('/path/to/workspace');
```

## Error Handling

### Installation Failure

```typescript
const result = await setupConftestEnvironment({ confirmInstall: true });

if (!result.success && !result.conftestInstalled) {
  console.error('Installation failed:', result.message);

  if (result.nextSteps) {
    result.nextSteps.forEach(step => console.log('  -', step));
  }
}
```

### Terminal Restart Required

```typescript
if (result.requiresRestart) {
  console.warn(result.restartInstructions);
  // Cannot proceed until user restarts their terminal
}
```

### Policy Download Failure

```typescript
if (!result.policiesAvailable) {
  console.error('Policy download failed');
  console.log('Manual alternative:');
  console.log('  git clone https://github.com/Azure/policy-library-avm.git policy');
}
```

### Common Failure Scenarios

| Scenario | Handling |
|----------|----------|
| No package manager found | Returns error with manual install URL |
| Installation fails | Tries next manager in chain, then manual |
| Git not installed | Suggests installing git with manual instructions |
| Policy clone fails | Suggests manual `git clone` command |
| PATH not updated | Recommends terminal restart |
| Insufficient permissions | Notes elevation requirement in status |

## Troubleshooting

### Installation Hangs

- Default timeout is 120 seconds for `installConftest()`, 300 seconds for `setupConftestEnvironment()`
- Increase with: `installConftest({ timeout: 600000 })`

### conftest Not Found After Install

- Restart your terminal session for PATH changes to take effect
- Check if the package manager requires elevated privileges (admin/sudo)
- Verify manually: `conftest --version`

### Policy Clone Fails

- Ensure git is installed: `git --version`
- Check GitHub connectivity  
- Manual clone: `git clone https://github.com/Azure/policy-library-avm.git policy`

### Cache Issues

- Check location: `getCacheRootPath()` → `~/.azure-terraform-mcp/`
- Clear specific cache: `clearCache('conftest')`
- Clear everything: `clearAllCaches()`

## Design Decisions

1. **Unified cache at `~/.azure-terraform-mcp/`** — Prevents duplicate downloads; shared across workspaces. Subdirectories: `azapi-schemas/`, `avm-data/`, `conftest-policies/`, `temp/`.

2. **Platform-aware fallback chain** — Each platform has a preferred package manager order. If one fails, the next is tried automatically.

3. **Separated concerns** — Auto-installer, policy manager, and setup orchestrator are independent modules, each independently testable and reusable.

4. **Command generation model** — The `generate_conftest_*` tools return commands for the agent to execute locally (not server-side). This gives agents full control over execution environment and timing.

5. **Backward compatibility** — The original `checkConftestInstallation()` behavior is preserved. The `autoSetup` parameter is opt-in.
