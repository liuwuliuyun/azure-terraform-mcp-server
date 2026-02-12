# Automated Conftest Installation & Policy Setup - Proposal

## Current State
- `checkConftestInstallation()` returns `installationHelp` text for users to follow manually
- Policy library requires 2-3 manual `git clone` commands
- Users must understand multiple steps and execute them in right order
- No guarantee environment is properly set up before validation

## Proposed Solution

### Flow Diagram
```
User calls: checkConftestInstallation({ autoSetup: true })
              ↓
     ✅ Conftest installed?
     ├─ YES → ✅ Policy dir exists?
     │        ├─ YES → Return success
     │        └─ NO → Auto-clone policies → Return success
     └─ NO → (Prompted mode) Ask user confirmation
             ├─ User: YES
             │   ├─ Detect platform (Windows/macOS/Linux)
             │   ├─ Install conftest
             │   ├─ Auto-clone policies
             │   ├─ Verify installation
             │   └─ Suggest restart if needed
             └─ User: NO → Return help text (existing behavior)
```

### Key Components

#### 1. **Auto-Installer Module** (`src/tools/conftest-auto-installer.ts`)
```typescript
// Platform detection & installation logic
- detectPlatform(): 'windows' | 'macos' | 'linux'
- detectPackageManager(): 'brew' | 'apt' | 'dnf' | 'scoop' | 'choco' | 'manual'
- installConftest(platform, packageManager): Promise<InstallationStepResult>
- verifyInstallation(): Promise<boolean>
- requiresRestart(): boolean
```

**What it does:**
- Auto-detects platform and available package managers
- Runs appropriate install command with elevated privileges where needed
- Captures installation output/errors
- Verifies conftest is in PATH
- Returns detailed results with restart requirements

#### 2. **Policy Management Module** (`src/tools/policy-manager.ts`)
```typescript
// Policy library clone/update logic
- clonePolicyLibrary(workspacePath): Promise<PolicySetupResult>
- updatePolicyLibrary(workspacePath): Promise<PolicySetupResult>
- verifyPolicyDirectories(workspacePath): Promise<PolicyVerification>
- getPolicyStatus(workspacePath): Promise<PolicyStatus>
```

**What it does:**
- Clones `https://github.com/Azure/policy-library-avm.git` to `./policy` in workspace
- Updates existing policy repo with `git pull`
- Verifies all expected policy subdirectories exist
- Reports completion with policy set summary

#### 3. **Setup Orchestrator** (`src/tools/conftest-setup.ts`)
```typescript
// Main orchestration: checks → install → policies
export async function setupConftestEnvironment(params: SetupParams): Promise<SetupResult>
```

**Workflow:**
1. **Check Phase**: Run installation checks in sequence
   - Is conftest installed?
   - Are policies available at workspace?
   - Are all expected policy sets present?

2. **Install Phase** (if needed & user confirms):
   - Install conftest with platform-specific method
   - Verify installation succeeded
   - Check if restart needed

3. **Policy Phase** (if needed):
   - Clone/update policy library to workspace
   - Verify all policy sets accessible
   - Report policy directory structure

4. **Report Phase**:
   - Return comprehensive result with status
   - Include restart instructions if needed
   - No further user action required

#### 4. **Enhanced Types** (`src/core/types.ts`)

```typescript
// Installation step result
interface InstallationStepResult {
  step: 'detect' | 'install' | 'verify';
  success: boolean;
  message: string;
  details?: Record<string, string>;
  requiresRestart?: boolean;
  error?: string;
}

// Setup environment result
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
  policiesPath?: string;
  policySets?: string[];
  
  // Actions taken
  actionsTaken: ('conftest-install' | 'policy-clone' | 'policy-update')[];
  
  // Requirements
  requiresRestart: boolean;
  restartInstructions?: string;
  
  // Next steps
  readyToValidate: boolean;
  nextSteps?: string[];
}

// Enhanced check params
interface CheckConftestInstallationParamsType {
  workspacePath?: string;
  autoSetup?: boolean;  // NEW: Enable auto-setup flow
}
```

### Implementation Details

#### Windows (Preferred: scoop/choco, Fallback: manual)
```bash
# Try scoop first (doesn't need admin)
scoop install conftest

# Fallback to choco (needs admin)
choco install conftest -y

# Fallback: manual download + PATH
# https://github.com/open-policy-agent/conftest/releases
```

#### macOS (Preferred: brew, Fallback: manual)
```bash
# Preferred
brew install conftest

# Fallback
curl -L https://github.com/open-policy-agent/conftest/releases/download/v{version}/conftest_{version}_Darwin_x86_64.tar.gz | tar xz
sudo mv conftest /usr/local/bin/
```

#### Linux (Preferred: apt/dnf/brew, Fallback: manual)
```bash
# Ubuntu/Debian
apt-get update && apt-get install -y conftest

# RHEL/CentOS
dnf install -y conftest

# Fallback: manual download
```

### User Interaction (Prompted Mode)

**Example 1: Missing Conftest**
```
❌ Conftest not installed

Installing conftest...
✅ Detected platform: Windows
✅ Found package manager: scoop (no admin required)

Installing conftest with scoop... [waiting]
✅ Installation successful (v0.55.0)
✅ Verified: conftest in PATH

Would you like me to clone the Azure policy library to your workspace?
(This requires git and will create ./policy directory)
[Y/n]: _
```

**Example 2: Success**
```
✅ Setup complete!

Status:
  ✅ Conftest v0.55.0 installed
  ✅ Azure policy library ready
     - policy/
     - policy/avmsec/
     - policy/Azure-Proactive-Resiliency-Library-v2/

You may need to restart your terminal for changes to take effect.
Ready to validate Terraform configurations!
```

### Benefits

| Current Approach | Proposed Approach |
|---|---|
| User reads 5+ installation help steps | One call: `setupConftestEnvironment()` |
| Manual platform-specific commands | Auto-detects, auto-runs |
| Multiple git clone attempts | Single auto-clone to workspace |
| Unclear if setup succeeded | Explicit success verification |
| "Maybe restart?" confusion | Clear restart instructions |
| Possible PATH not updated | Explicit PATH verification |

### Error Handling

```typescript
// If scoop fails, try choco
// If choco needs admin and user denies, suggest manual install
// If git missing, guide user to install git first
// If policy clone fails, provide manual fallback command
// If installation succeeds but conftest still not in PATH, 
//   suggest terminal restart
```

### Configuration in MCP

New MCP tool:
```json
{
  "name": "setup_conftest_environment",
  "description": "Automatically install conftest and policy library with user confirmation",
  "inputSchema": {
    "type": "object",
    "properties": {
      "workspacePath": {
        "type": "string",
        "description": "Path to workspace (optional, uses current if not provided)"
      },
      "confirmInstall": {
        "type": "boolean",
        "description": "User confirmed they want to proceed with installation"
      }
    }
  }
}
```

### No More Manual Steps! 

**Before:**
1. Check installation → Get 10 lines of help text
2. Manually run 3+ commands
3. Clone policies manually
4. Restart terminal
5. Hope everything works

**After:**
1. Call `setupConftestEnvironment()`
2. System detects + installs (prompted)
3. Auto-clones policies
4. Reports ready status
5. Done! ✅

## Files to Create/Modify

### New Files
- `src/tools/conftest-auto-installer.ts` - Installation logic
- `src/tools/policy-manager.ts` - Policy repo management
- `src/tools/conftest-setup.ts` - Main orchestrator
- `tests/unit/conftest-auto-installer.test.ts` - Unit tests
- `tests/integration/conftest-setup.integration.test.ts` - Integration tests

### Modified Files
- `src/core/types.ts` - New types
- `src/core/utils.ts` - Platform detection helpers
- `src/tools/conftest-runner.ts` - Add setup option
- `src/tools/index.ts` - Export new tools
- `src/server.ts` - Register new MCP tool
- `tests/conftest-runner.test.ts` - Test enhanced check function

## Backwards Compatibility

✅ All existing tools work unchanged
✅ New `autoSetup` parameter is optional
✅ Prompted mode asks for confirmation (no silent install)
✅ Existing help text available as fallback
