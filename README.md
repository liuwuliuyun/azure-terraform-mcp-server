# Azure Terraform MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides AI assistants with comprehensive tools for working with Azure Terraform infrastructure. This server enables AI models to access documentation, export Azure resources, and validate Terraform configurations against Azure policies.

## Features

### Documentation Tools
- **AzureRM Provider Documentation** - Retrieve comprehensive documentation for any AzureRM resource type, including arguments, attributes, and examples
- **AzAPI Provider Documentation** - Access Azure REST API documentation for AzAPI resources with schema information
- **Azure Verified Modules (AVM)** - Browse, search, and retrieve details about Azure Verified Modules including versions, variables, and outputs

### Resource Export Tools
- **Azure Resource Export** - Export individual Azure resources to Terraform configuration using aztfexport
- **Resource Group Export** - Export entire resource groups with all contained resources
- **Query-based Export** - Export resources matching Azure Resource Graph queries

### Policy Validation Tools
- **Conftest Integration** - Validate Terraform configurations against Azure security policies
- **AVM Security Policies** - Built-in support for Azure Verified Modules security policy sets
- **Custom Policy Support** - Use your own OPA/Rego policies for validation

## Installation

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Optional: [aztfexport](https://github.com/Azure/aztfexport) for resource export functionality
- Optional: [Conftest](https://www.conftest.dev/) for policy validation
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

*Required for aztfexport operations

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
- `continueOnError` (optional): Continue on errors (default: `false`)

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

Check if Conftest is installed.

**Parameters:** None

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

## Library Usage

You can also use this package as a library in your own applications:

```typescript
import {
  createServer,
  getAzureRMProviderDocumentation,
  listAvmModules,
  generateExportAzureResourceCommand_impl,
  generateConftestWorkspaceValidationCommand_impl,
} from '@azure/terraform-mcp-server';

// Get documentation programmatically
const docs = await getAzureRMProviderDocumentation({
  resourceTypeName: 'azurerm_storage_account',
  docType: 'resource',
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

## Architecture

```
src/
├── cli.ts              # CLI entry point
├── server.ts           # MCP server setup and tool registration
├── index.ts            # Library exports
├── core/
│   ├── config.ts       # Configuration management
│   ├── errors.ts       # Custom error classes
│   ├── types.ts        # TypeScript types and Zod schemas
│   └── utils.ts        # Utility functions
└── tools/
    ├── azurerm-docs-provider.ts     # AzureRM provider documentation
    ├── azapi-docs-provider.ts       # AzAPI provider documentation
    ├── azapi-schema-generator.ts    # AzAPI schema generation utilities
    ├── avm-docs-provider.ts         # Azure Verified Modules documentation
    ├── aztfexport-runner.ts         # Resource export command generation
    ├── conftest-runner.ts           # Policy validation command generation
    └── index.ts                     # Tool exports
```

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
