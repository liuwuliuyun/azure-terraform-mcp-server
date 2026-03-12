# Azure Terraform MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides AI assistants with comprehensive tools for working with Azure Terraform infrastructure. This server enables AI models to access documentation, export Azure resources, and validate Terraform configurations against Azure policies.

## Features

### Documentation Tools
- **AzureRM Provider Documentation** - Retrieve comprehensive documentation for any AzureRM resource type, including arguments, attributes, and examples
- **AzAPI Provider Documentation** - Access Azure REST API documentation for AzAPI resources with auto-generated HCL schemas from Bicep type definitions
- **AzAPI Examples** - Fetch Terraform examples for AzAPI resources from the Azure template-reference-generator repository
- **Azure Verified Modules (AVM)** - Browse, search, and retrieve details about Azure Verified Modules including versions, variables, and outputs

### Resource Export Tools
- **Azure Resource Export** - Export individual Azure resources to Terraform configuration using aztfexport
- **Resource Group Export** - Export entire resource groups with all contained resources
- **Query-based Export** - Export resources matching Azure Resource Graph queries

### Policy Validation Tools
- **Conftest Integration** - Validate Terraform configurations against Azure security policies
- **AVM Security Policies** - Built-in support for Azure Verified Modules security policy sets
- **Custom Policy Support** - Use your own OPA/Rego policies for validation
- **Automated Conftest Setup** - Platform-aware auto-installation of Conftest with intelligent package manager fallbacks (brew, apt, scoop, choco, etc.)
- **Policy Library Management** - Automatic cloning and updating of Azure policy libraries from GitHub

### Caching
- **Unified Cache Management** - Persistent cache at `~/.azure-terraform-mcp/` for AzAPI schemas, AVM data, conftest policies, and temporary files
- **Automatic Expiry** - Cached data expires based on configurable TTL (e.g., 5 days for AzAPI schemas, 7 days for temp files)

### Telemetry & Monitoring
- **Azure Application Insights Integration** - Built-in telemetry collection for tool usage, performance metrics, and error tracking
- **Monthly Active Users (MAU) Tracking** - Unique user identification and persistence across sessions
- **Tool Execution Metrics** - Automatic tracking of tool call counts, execution duration, and error rates
- **Configurable Sampling** - Control telemetry volume and costs with sampling rates
- **See [Telemetry Setup Guide](docs/TELEMETRY.md) for details**

## Installation

### Prerequisites

- Node.js >= 20.0.0
- npm or yarn
- Optional: [aztfexport](https://github.com/Azure/aztfexport) for resource export functionality
- Optional: [Conftest](https://www.conftest.dev/) for policy validation (can be auto-installed via `setup_conftest_environment`)
- Optional: [Terraform](https://www.terraform.io/) for plan generation and export

### Install from npm

```bash
npm install -g @azure/terraform-mcp-server
```

### Install from source

```bash
git clone https://github.com/Azure/azure-terraform-mcp-server.git
cd azure-terraform-mcp-server
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub personal access token for API requests (recommended to avoid rate limits) | No |
| `MCP_WORKSPACE_ROOT` | Root directory for workspace operations | No |
| `MCP_DEBUG` | Enable debug mode (`true`/`false`) | No |
| `ARM_SUBSCRIPTION_ID` | Azure subscription ID for aztfexport operations | No* |
| `ARM_TENANT_ID` | Azure tenant ID | No* |
| `ARM_CLIENT_ID` | Azure client/application ID | No* |
| `ARM_CLIENT_SECRET` | Azure client secret | No* |
| `TELEMETRY_ENABLED` | Enable/disable telemetry (`true`/`false`, default: `true`) | No |
| `TFMCP_AI_CON_STR` | Azure Application Insights connection string for telemetry | No |
| `TELEMETRY_SAMPLE_RATE` | Telemetry sampling rate 0.0-1.0 (default: 1.0) | No |
| `TELEMETRY_FLUSH_ON_SHUTDOWN` | Flush telemetry on graceful shutdown (`true`/`false`, default: `true`) | No |
| `TELEMETRY_EXPORT_INTERVAL_MS` | Telemetry export interval in milliseconds (default: 300000) | No |

*Required for aztfexport operations

> **Telemetry**: By default, the server collects anonymous usage metrics (tool execution counts, duration, errors) and sends them to Azure Application Insights if a connection string is provided. No personal data is collected. See [Telemetry Setup Guide](docs/TELEMETRY.md) for configuration and privacy details.

### MCP Client Configuration

#### Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "azure-terraform": {
      "command": "azure-terraform-mcp-server",
      "env": {
        "GITHUB_TOKEN": "your-github-token"
      }
    }
  }
}
```

#### VS Code with MCP Extension

Add to your VS Code MCP configuration (`.vscode/mcp.json` or user settings):

**Using global installation:**

```json
{
  "servers": {
    "azure-terraform": {
      "command": "azure-terraform-mcp-server",
      "env": {
        "GITHUB_TOKEN": "${env:GITHUB_TOKEN}"
      }
    }
  }
}
```

**Using local development (from source):**

```json
{
  "servers": {
    "azure-terraform": {
      "command": "npm",
      "args": ["start"],
      "cwd": "C:\\path\\to\\azure-terraform-mcp-server",
      "env": {
        "ARM_CLIENT_ID": "${env:ARM_CLIENT_ID}",
        "ARM_CLIENT_SECRET": "${env:ARM_CLIENT_SECRET}",
        "ARM_SUBSCRIPTION_ID": "${env:ARM_SUBSCRIPTION_ID}",
        "ARM_TENANT_ID": "${env:ARM_TENANT_ID}",
        "GITHUB_TOKEN": "${env:GITHUB_TOKEN}"
      }
    }
  }
}
```

## Command Generation Approach

The aztfexport and conftest tools use a **command generation model** rather than direct execution. Instead of running these tools server-side, the MCP server generates the appropriate command with all parameters and returns it to the agent for local execution.

### Benefits

- **Agent Control**: The agent (Claude, VS Code, etc.) controls command execution timing and environment
- **Local Execution**: Commands run in the agent's environment with proper dependencies
- **Better Error Handling**: The agent can handle failures and retry with different parameters
- **Transparency**: Full command visibility - agents can inspect, modify, and understand the exact commands being run
- **Scalability**: No long-running processes or resource constraints on the server

### How It Works

1. **Generate Command**: Call a tool like `generate_aztfexport_resource_command` with parameters
2. **Receive Command Structure**: Get back the command, arguments, working directory, and instructions
3. **Execute Locally**: The agent runs the command in its environment
4. **Process Results**: The agent handles the output files or validation results

### Example Flow

```
Agent → "Generate aztfexport command for resource X"
  ↓
MCP Server → Returns: { command: "aztfexport", args: [...], notes: [...] }
  ↓
Agent → Runs: "aztfexport resource X --arg1 value1 ..."
  ↓
Agent → Processes generated Terraform files
```

## Available Tools

### Documentation Tools

#### `get_azurerm_provider_documentation`

Retrieve documentation for an AzureRM resource type.

**Parameters:**
- `resourceTypeName` (required): The AzureRM resource type (e.g., `azurerm_virtual_machine`)
- `docType` (optional): `resource` or `data-source` (default: `resource`)
- `argumentName` (optional): Filter to a specific argument
- `attributeName` (optional): Filter to a specific attribute

**Example:**
```json
{
  "resourceTypeName": "azurerm_storage_account",
  "docType": "resource"
}
```

#### `get_azapi_provider_documentation`

Retrieve documentation for an AzAPI resource type.

**Parameters:**
- `resourceTypeName` (required): Azure resource type in REST API format (e.g., `Microsoft.Storage/storageAccounts`)
- `apiVersion` (optional): Specific API version

#### `list_avm_modules`

List all available Azure Verified Modules.

**Parameters:** None

#### `get_avm_latest_version`

Get the latest version of a specific AVM module.

**Parameters:**
- `moduleName` (required): The module name (e.g., `avm-res-storage-storageaccount`)

#### `get_avm_versions`

List all versions of a specific AVM module.

**Parameters:**
- `moduleName` (required): The module name

#### `get_avm_documentation`

Get the documentation (README.md) for a specific module version.

**Parameters:**
- `moduleName` (required): The module name
- `moduleVersion` (required): The version (e.g., `0.1.0`)

### Resource Export Tools

#### `check_aztfexport_installation`

Check if aztfexport and terraform are installed.

**Parameters:** None

#### `generate_aztfexport_resource_command`

Generate an aztfexport command to export a single Azure resource to Terraform configuration. The command is returned for the agent to execute locally.

**Parameters:**
- `resourceId` (required): Full Azure resource ID
- `outputFolderName` (optional): Output folder name
- `provider` (optional): `azurerm` or `azapi` (default: `azurerm`)
- `resourceName` (optional): Custom Terraform resource name
- `resourceType` (optional): Custom Terraform resource type
- `dryRun` (optional): Preview without creating files (default: `false`)
- `includeRoleAssignment` (optional): Include role assignments (default: `false`)
- `parallelism` (optional): Parallel operations (1-50, default: `10`)
- `continueOnError` (optional): Continue on errors (default: `true`)

**Returns:** Command structure with executable command, arguments, and instructions for local execution

#### `generate_aztfexport_resource_group_command`

Generate an aztfexport command to export an entire resource group and all its resources to Terraform configuration. The command is returned for the agent to execute locally.

**Parameters:**
- `resourceGroupName` (required): Name of the resource group
- `outputFolderName` (optional): Output folder name
- `provider` (optional): `azurerm` or `azapi` (default: `azurerm`)
- `namePattern` (optional): Resource naming pattern
- `typePattern` (optional): Resource type filter pattern
- `dryRun` (optional): Preview without creating files
- `includeRoleAssignment` (optional): Include role assignments
- `parallelism` (optional): Parallel operations
- `continueOnError` (optional): Continue on errors

**Returns:** Command structure with executable command, arguments, and instructions for local execution

#### `generate_aztfexport_resources_by_query_command`

Generate an aztfexport command to export resources matching an Azure Resource Graph query to Terraform configuration. The command is returned for the agent to execute locally.

**Parameters:**
- `query` (required): Azure Resource Graph query (WHERE clause)
- `outputFolderName` (optional): Output folder name
- `provider` (optional): `azurerm` or `azapi`
- Other options same as resource group export

**Returns:** Command structure with executable command, arguments, and instructions for local execution

### Policy Validation Tools

#### `check_conftest_installation`

Check if Conftest is installed and get version information.

**Parameters:**
- `workspacePath` (optional): Path to workspace for policy download
- `autoSetup` (optional): Enable automatic setup with user confirmation (default: `false`)

#### `generate_conftest_workspace_validation_command`

Generate a conftest command to validate Terraform files in a workspace folder against Azure security policies. The command is returned for the agent to execute locally.

**Parameters:**
- `workspaceFolder` (required): Path to the workspace folder
- `policySet` (optional): `all`, `Azure-Proactive-Resiliency-Library-v2`, or `avmsec` (default: `all`)
- `severityFilter` (optional): `high`, `medium`, `low`, or `info`
- `customPolicies` (optional): Comma-separated custom policy paths

**Returns:** Command structure with executable command, arguments, working directory, and detailed instructions for local execution

#### `generate_conftest_workspace_plan_validation_command`

Generate a conftest command to validate Terraform plan files against Azure security policies. The command is returned for the agent to execute locally.

**Parameters:**
- `folderName` (required): Folder containing the plan file
- `policySet` (optional): Policy set to use
- `severityFilter` (optional): Severity filter
- `customPolicies` (optional): Custom policy paths

**Returns:** Command structure with executable command, arguments, working directory, and detailed instructions for local execution

#### `setup_conftest_environment`

Automatically setup Conftest environment: checks installation, installs if needed, downloads policies, and validates everything is working. This is a comprehensive one-step setup that handles platform-aware installation with intelligent fallbacks.

**Parameters:**
- `workspacePath` (optional): Path to workspace for policy download (defaults to current directory)
- `confirmInstall` (optional): User confirmed they want to proceed with installation (default: `false`)
- `skipPolicies` (optional): Skip policy library setup (default: `false`)

**Returns:** Setup result with comprehensive status report including:
- Installation status and version
- Policy library status and available policy sets
- Actions taken (installation, policy clone/update)
- Restart requirements and next steps

**Example Response:**
```json
{
  "success": true,
  "message": "✅ Conftest v0.55.0 | ✅ Policies available (2 sets)",
  "conftestInstalled": true,
  "conftestVersion": "0.55.0",
  "policiesAvailable": true,
  "policySets": ["avmsec", "Azure-Proactive-Resiliency-Library-v2"],
  "actionsTaken": ["conftest-install", "policy-clone"],
  "requiresRestart": false,
  "readyToValidate": true
}
```

## Library Usage

You can also use this package as a library in your own applications:

```typescript
import {
  createServer,
  getAzureRMProviderDocumentation,
  getAzAPIProviderDocumentation,
  listAvmModules,
  generateExportAzureResourceCommand_impl,
  generateConftestWorkspaceValidationCommand_impl,
} from '@azure/terraform-mcp-server';

// Get documentation programmatically
const docs = await getAzureRMProviderDocumentation({
  resourceTypeName: 'azurerm_storage_account',
  docType: 'resource',
});

// Get AzAPI documentation
const azapiDocs = await getAzAPIProviderDocumentation({
  resourceTypeName: 'Microsoft.Storage/storageAccounts',
});

// List AVM modules
const modules = await listAvmModules({});

// Generate an aztfexport command
const exportCommand = await generateExportAzureResourceCommand_impl({
  resourceId: '/subscriptions/.../resourceGroups/.../providers/...',
  provider: 'azurerm',
});

// Generate a conftest command
const conftestCommand = await generateConftestWorkspaceValidationCommand_impl({
  workspaceFolder: './terraform',
  policySet: 'avmsec',
});
```

### Conftest Auto-Setup

The server includes automated Conftest installation and policy management, available via the `tools` sub-path export:

```typescript
import {
  setupConftestEnvironment,
  installConftest,
  detectPlatform,
  clonePolicyLibrary,
  getPolicyStatus,
} from '@azure/terraform-mcp-server/tools';

// Full automated setup (install conftest + download policies)
const result = await setupConftestEnvironment({
  workspacePath: './terraform',
  confirmInstall: true,
  skipPolicies: false,
});

if (result.readyToValidate) {
  console.log(`Conftest ${result.conftestVersion} ready`);
}
```

For the full API reference, advanced usage examples, error handling, and troubleshooting, see the [Conftest Auto-Setup Guide](docs/conftest-setup.md).

## Development

### Build

```bash
npm run build
```

### Watch mode

```bash
npm run dev
```

### Run tests

```bash
# Run unit tests
npm test

# Watch mode for development
npm run test:watch

# Run integration tests
npm run test:integration

# Watch mode for integration tests
npm run test:integration:watch

# Run all tests (unit + integration)
npm run test:all
```

### Lint

```bash
npm run lint
npm run lint:fix
```

### Type check

```bash
npm run typecheck
```

### Clean build artifacts

```bash
npm run clean
```

## Architecture

```
src/
├── cli.ts              # CLI entry point with graceful shutdown
├── server.ts           # MCP server setup and tool registration (14 tools)
├── index.ts            # Library exports
├── core/
│   ├── cache-manager.ts # Unified cache management (~/.azure-terraform-mcp/)
│   ├── config.ts       # Configuration management and environment variables
│   ├── errors.ts       # Custom error classes (7 error types)
│   ├── telemetry.ts    # Azure Monitor telemetry (metrics, MAU tracking)
│   ├── types.ts        # TypeScript types and Zod schemas (14 param schemas)
│   └── utils.ts        # Utility functions (command execution, path resolution)
└── tools/
    ├── azurerm-docs-provider.ts     # AzureRM provider documentation
    ├── azapi-docs-provider.ts       # AzAPI provider documentation
    ├── azapi-schema-generator.ts    # AzAPI schema generation from Bicep types
    ├── azapi-examples-provider.ts   # AzAPI Terraform examples from GitHub
    ├── avm-docs-provider.ts         # Azure Verified Modules documentation
    ├── aztfexport-runner.ts         # Resource export command generation
    ├── conftest-runner.ts           # Policy validation command generation
    ├── conftest-auto-installer.ts   # Platform-aware conftest auto-installation
    ├── conftest-setup.ts            # Conftest setup orchestrator
    ├── policy-manager.ts            # Policy library management (clone/update)
    └── index.ts                     # Tool exports
```

## Documentation

- [Conftest Auto-Setup Guide](docs/conftest-setup.md) — Detailed API reference, usage examples, error handling, and troubleshooting for the automated Conftest installation and policy management system
- [Telemetry Setup Guide](docs/TELEMETRY.md) — Telemetry configuration, metrics reference, Azure Monitor queries, and privacy details
- [Bug Bash Guide](docs/bug-bash-guide.md) — Step-by-step guide for testing the server with example prompts and scenarios

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Azure Export for Terraform (aztfexport)](https://github.com/Azure/aztfexport)
- [Azure Verified Modules](https://azure.github.io/Azure-Verified-Modules/)
- [Conftest](https://www.conftest.dev/)
- [Terraform AzureRM Provider](https://registry.terraform.io/providers/hashicorp/azurerm/latest)
- [Terraform AzAPI Provider](https://registry.terraform.io/providers/Azure/azapi/latest)
