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

#### `export_azure_resource`

Export a single Azure resource to Terraform.

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

#### `export_azure_resource_group`

Export an entire resource group.

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

#### `export_azure_resources_by_query`

Export resources matching an Azure Resource Graph query.

**Parameters:**
- `query` (required): Azure Resource Graph query (WHERE clause)
- `outputFolderName` (optional): Output folder name
- `provider` (optional): `azurerm` or `azapi`
- Other options same as resource group export

### Policy Validation Tools

#### `check_conftest_installation`

Check if Conftest is installed.

**Parameters:** None

#### `run_conftest_workspace_validation`

Validate Terraform files against policies.

**Parameters:**
- `workspaceFolder` (required): Path to the workspace folder
- `policySet` (optional): `all`, `Azure-Proactive-Resiliency-Library-v2`, or `avmsec` (default: `all`)
- `severityFilter` (optional): `high`, `medium`, `low`, or `info`
- `customPolicies` (optional): Comma-separated custom policy paths

#### `run_conftest_workspace_plan_validation`

Validate Terraform plan files against policies.

**Parameters:**
- `folderName` (required): Folder containing the plan file
- `policySet` (optional): Policy set to use
- `severityFilter` (optional): Severity filter
- `customPolicies` (optional): Custom policy paths

## Library Usage

You can also use this package as a library in your own applications:

```typescript
import {
  createServer,
  getAzureRMProviderDocumentation,
  listAvmModules,
  exportAzureResource,
} from '@azure/terraform-mcp-server';

// Get documentation programmatically
const docs = await getAzureRMProviderDocumentation({
  resourceTypeName: 'azurerm_storage_account',
  docType: 'resource',
});

// List AVM modules
const modules = await listAvmModules({});

// Export a resource
const result = await exportAzureResource({
  resourceId: '/subscriptions/.../resourceGroups/.../providers/...',
  provider: 'azurerm',
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
npm test
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
    ├── azurerm-docs-provider.ts  # AzureRM documentation
    ├── azapi-docs-provider.ts    # AzAPI documentation
    ├── avm-docs-provider.ts      # Azure Verified Modules
    ├── aztfexport-runner.ts      # Resource export
    └── conftest-runner.ts        # Policy validation
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
