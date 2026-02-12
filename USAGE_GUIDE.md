# Using the Automated Conftest Setup System

## Quick Start

### For Agent/MCP Tool Calls

```typescript
// Import the setup function
import { setupConftestEnvironment } from '@azure/terraform-mcp-server';

// Run automated setup
const result = await setupConftestEnvironment({
  workspacePath: './terraform',
  confirmInstall: true,
  skipPolicies: false,
  verbose: false
});

// Check result
if (result.readyToValidate) {
  console.log('✅ Ready to validate Terraform!');
  console.log(`Conftest: ${result.conftestVersion}`);
  console.log(`Policies: ${result.policySets.join(', ')}`);
} else {
  console.log('❌ Setup incomplete');
  console.log('Next steps:', result.nextSteps);
  if (result.requiresRestart) {
    console.log('⚠️ Terminal restart required');
  }
}
```

---

## Detailed Usage Examples

### Example 1: Check Installation Only (No Installation)

```typescript
import { checkConftestInstallationWithSetup } from '@azure/terraform-mcp-server';

// Simple check - no installation
const result = await checkConftestInstallationWithSetup(
  undefined,  // workspace path (uses current)
  false       // autoSetup disabled
);

console.log(`Installed: ${result.conftestInstalled}`);
console.log(`Version: ${result.conftestVersion}`);
console.log(`Ready: ${result.readyToValidate}`);
```

### Example 2: Auto-Setup with Confirmation

```typescript
import { setupConftestEnvironment } from '@azure/terraform-mcp-server';

// Full automatic setup
const result = await setupConftestEnvironment({
  workspacePath: '/path/to/terraform',
  confirmInstall: true,    // User confirmed installation
  skipPolicies: false,     // Download policies
  verbose: true            // Show detailed output
});

// Result includes:
// - Installation step details
// - Policy download status
// - Restart requirements
// - Next steps
console.log(result.message);  // Human-readable summary
console.log(result.actionsTaken);  // What was actually done
```

### Example 3: Skip Policy Download

```typescript
// Just install conftest, skip policies
const result = await setupConftestEnvironment({
  workspacePath: '/path/to/terraform',
  confirmInstall: true,
  skipPolicies: true       // Don't download policies
});

// Useful when:
// - You already have policies cached
// - Want to install conftest only
// - Policies will be added manually later
```

### Example 4: Use Existing Unified Cache

```typescript
import { 
  setupConftestEnvironment,
  getCacheStatus,
  cleanExpiredTempFiles 
} from '@azure/terraform-mcp-server';

// Check cache status before setup
const cacheStatus = getCacheStatus();
console.log(`Cache location: ${cacheStatus.rootPath}`);
console.log(`Policies cached: ${cacheStatus.subdirectories.conftest.exists}`);

// Run setup
const result = await setupConftestEnvironment({
  workspacePath: '/path/to/terraform',
  confirmInstall: true
});

// Clean up old temp files
const cleaned = cleanExpiredTempFiles();
console.log(`Cleaned ${cleaned} temp files`);
```

### Example 5: Individual Module Usage

```typescript
import {
  clonePolicyLibrary,
  updatePolicyLibrary,
  getPolicyStatus,
  installConftest,
  detectPlatform
} from '@azure/terraform-mcp-server';

// Just install conftest
const installResult = await installConftest({
  verbose: true,
  timeout: 120000
});
console.log(installResult.steps);

// Just manage policies
const cloneResult = await clonePolicyLibrary('/path/to/workspace');
if (cloneResult.success) {
  console.log(`Policies available: ${cloneResult.policySets}`);
}

// Just check status
const status = getPolicyStatus('/path/to/workspace');
console.log(`Policies available: ${status.available}`);
```

---

## API Reference

### setupConftestEnvironment(params)

**Parameters:**
```typescript
{
  workspacePath?: string;      // Path to workspace (default: cwd)
  confirmInstall?: boolean;    // Allow installation (default: false)
  skipPolicies?: boolean;      // Skip policy download (default: false)
  verbose?: boolean;           // Show detailed logs (default: false)
}
```

**Returns:** `Promise<SetupEnvironmentResult>`

```typescript
{
  success: boolean;                      // Overall success
  message: string;                       // Human-readable summary
  
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

### checkConftestInstallationWithSetup(workspacePath?, autoSetup?)

**Parameters:**
```typescript
workspacePath?: string;  // Workspace path (default: cwd)
autoSetup?: boolean;     // Enable auto-setup (default: false)
```

**Returns:** `Promise<SetupEnvironmentResult>`

### Individual Module Functions

#### conftest-auto-installer.ts
```typescript
detectPlatform()                              // → Platform
detectPackageManagers(platform?)              // → PackageManager[]
installConftest(config?)                      // → Promise<InstallResult>
checkConftestInstalled()                      // → Promise<boolean>
getConftestVersion()                          // → Promise<string|null>
```

#### policy-manager.ts
```typescript
getPolicyPath(workspacePath)                  // → string
clonePolicyLibrary(workspacePath)             // → Promise<PolicySetupResult>
updatePolicyLibrary(workspacePath)            // → Promise<PolicySetupResult>
getPolicyStatus(workspacePath)                // → PolicyLibraryStatus
verifyPolicyDirectory(policyPath)             // → PolicyVerification
```

#### cache-manager.ts
```typescript
getCacheRootPath()                            // → string
getCachePath(type: CacheType)                 // → string
getCacheFilePath(type, filename)              // → string
getCacheStatus()                              // → CacheStatus
clearCache(type: CacheType)                   // → boolean
clearAllCaches()                              // → boolean
cleanExpiredTempFiles()                       // → number (count cleaned)
resetCacheManager()                           // → void (testing)
```

---

## Integration with MCP Tools

### Register in server.ts

```typescript
import { setupConftestEnvironment } from './tools/conftest-setup.js';
import { SetupConftestEnvironmentParams } from './core/types.js';

// Add to tool definitions
const tools = [
  // ... existing tools ...
  {
    name: 'setup_conftest_environment',
    description: 'Automatically install conftest and download policy library with user confirmation',
    inputSchema: SetupConftestEnvironmentParams.schema,
    handler: setupConftestEnvironment,
  },
];
```

### Call from Agent

```typescript
// Agent calls MCP tool
const result = await mcp.callTool('setup_conftest_environment', {
  workspacePath: '/path/to/terraform',
  confirmInstall: true,
  skipPolicies: false
});

// Handle result
if (result.data.readyToValidate) {
  // Proceed with validation
  await runConftestValidation();
} else {
  // Show error or next steps
  console.log('Setup failed. Next steps:', result.data.nextSteps);
}
```

---

## Common Workflows

### Workflow 1: Full Automatic Setup

```typescript
// User wants everything automated
const result = await setupConftestEnvironment({
  workspacePath: './terraform',
  confirmInstall: true,   // ← User confirms
  skipPolicies: false,    // ← Download policies
});

if (result.readyToValidate) {
  // Run validation immediately
  await validateTerraform();
} else if (result.requiresRestart) {
  // Tell user to restart
  console.log(result.restartInstructions);
  process.exit(0);
}
```

### Workflow 2: Check Without Installation

```typescript
// Just check current status
const result = await setupConftestEnvironment({
  workspacePath: './terraform',
  confirmInstall: false,  // ← Don't install
  skipPolicies: true,     // ← Don't download
});

if (!result.conftestInstalled) {
  console.log('Conftest not installed. Run with confirmInstall=true to install.');
}
```

### Workflow 3: Staged Setup

```typescript
// Step 1: Check
const check = await setupConftestEnvironment({
  confirmInstall: false,
  skipPolicies: true
});

if (!check.conftestInstalled) {
  console.log('Installing conftest...');
  // Step 2: Install
  const install = await setupConftestEnvironment({
    confirmInstall: true,
    skipPolicies: true
  });
  
  if (install.requiresRestart) {
    console.log('Please restart your terminal');
    return;
  }
}

// Step 3: Get policies
const final = await setupConftestEnvironment({
  confirmInstall: false,
  skipPolicies: false
});

console.log('Ready!', final.readyToValidate);
```

---

## Error Handling

### When Installation Fails

```typescript
const result = await setupConftestEnvironment({
  confirmInstall: true
});

if (!result.success && !result.conftestInstalled) {
  console.error('Installation failed:', result.message);
  
  // Check what next steps are recommended
  if (result.nextSteps) {
    console.log('Try these:');
    result.nextSteps.forEach(step => console.log('  -', step));
  }
  
  // Fall back to manual instructions
  const manual = getConftestInstallationHelp();
  console.log('Or follow:', manual.documentationUrl);
}
```

### When Restart is Required

```typescript
const result = await setupConftestEnvironment({
  confirmInstall: true
});

if (result.requiresRestart) {
  console.warn(result.restartInstructions);
  // Cannot proceed until user restarts
  // Wait for user action or offer to spawn new shell
}
```

### When Policies Unavailable

```typescript
const result = await setupConftestEnvironment({
  confirmInstall: true,
  skipPolicies: false
});

if (!result.policiesAvailable) {
  console.error('Policy download failed');
  
  // Offer manual alternative
  console.log('Manual policy clone:');
  console.log(`cd ${result.policyStatus?.path || 'workspace'}`);
  console.log('git clone https://github.com/Azure/policy-library-avm.git policy');
}
```

---

## Testing

### Run Unit Tests
```bash
npm test -- tests/unit/conftest-auto-installer.test.ts
```

### Run Integration Tests
```bash
npm test -- tests/integration/conftest-setup.integration.test.ts
```

### Skip Long-Running Tests
```bash
SKIP_CONFTEST_TESTS=true npm test
```

---

## Troubleshooting

### Installation Hangs
- Check timeout setting (default: 300s)
- Increase with: `installConftest({ timeout: 600000 })`

### Can't Find conftest After Install
- User might need to restart terminal
- Check for elevation/UAC requirements
- Run `conftest --version` manually to verify

### Policy Clone Fails
- Ensure git is installed: `git --version`
- Check GitHub connectivity
- Run manual clone: `git clone https://github.com/Azure/policy-library-avm.git policy`

### Cache Issues
- Clear all caches: `clearAllCaches()`
- Clear specific type: `clearCache('conftest')`
- Check cache location: `getCacheRootPath()`

---

## Performance Tips

1. **Reuse results**: Store `SetupEnvironmentResult` to avoid re-running
2. **Skip when possible**: Use `skipPolicies: true` if policies cached
3. **Batch operations**: Setup once, validate multiple files
4. **Use cache**: Policy library in `~/.azure-terraform-mcp/conftest-policies`
5. **Parallel execution**: Run multiple installs in parallel (different workspaces)

---

## Version Information

- **Minimum Node.js**: 18.0.0
- **TypeScript**: Strict mode
- **Test Coverage**: 236 unit/integration tests
- **Build Time**: ~150ms
- **Bundle Size**: ~120KB (minified)

---

## Contributing

New features should:
1. ✅ Include unit tests
2. ✅ Include integration tests
3. ✅ Update types in `src/core/types.ts`
4. ✅ Pass `npm run typecheck`
5. ✅ Pass `npm run test`
6. ✅ Pass `npm run build`

---

## License

MIT - See LICENSE file for details
