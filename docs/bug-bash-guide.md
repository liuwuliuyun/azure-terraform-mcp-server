# Azure Terraform MCP Server — Bug Bash Guide

Welcome! This guide will walk you through setting up and testing the **Azure Terraform MCP Server** locally in VS Code. No prior Terraform or MCP experience is required — just follow the steps below.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Set Up the Server](#2-set-up-the-server)
3. [Configure & Start the MCP Server in VS Code](#3-configure--start-the-mcp-server-in-vs-code)
4. [Verify the Server is Running](#4-verify-the-server-is-running)
5. [Test Scenarios](#5-test-scenarios)
6. [How to Report Bugs](#6-how-to-report-bugs)

---

## 1. Prerequisites

Before you start, make sure you have the following installed:

| Tool | Version | How to check | Install link |
|------|---------|-------------|--------------|
| **Git** | any | `git --version` | https://git-scm.com/downloads |
| **Node.js** | >= 20.0.0 | `node --version` | https://nodejs.org/ (LTS recommended) |
| **VS Code** | latest | — | https://code.visualstudio.com/ |

### Optional (for advanced test scenarios)

| Tool | Purpose | Install link |
|------|---------|--------------|
| **aztfexport** | Azure resource export tests | https://github.com/Azure/aztfexport |
| **Conftest** | Policy validation tests | https://www.conftest.dev/ (or let the server auto-install it via `setup_conftest_environment`) |
| **Terraform** | Plan generation for conftest and aztfexport | https://www.terraform.io/downloads |


## 2. Set Up the Server

You have two options:

### Option A — Install globally from source (recommended)

```powershell
# 1. Clone the repository
git clone https://github.com/Azure/azure-terraform-mcp-server.git

# 2. Install dependencies, build, and register globally
cd azure-terraform-mcp-server
npm install
npm run build
npm install -g .
```

This registers the `azure-terraform-mcp-server` command globally on your machine so you can run it from anywhere without pointing to the repo folder.

### Option B — Run from source (without global install)

```powershell
# 1. Clone the repository
git clone https://github.com/Azure/azure-terraform-mcp-server.git

# 2. Install dependencies and build
cd azure-terraform-mcp-server
npm install
npm run build
```

> **Important:** The `npm run build` step is required — `npm start` runs the pre-built output from `dist/`.

## 3. Configure & Start the MCP Server in VS Code

### Step 3a — Open any folder in VS Code

You can open **any folder** (or create a new one) in VS Code — this will be your testing workspace. It does **not** need to be the cloned repo folder.

For example, create a fresh test folder and open it:

```powershell
mkdir C:\Users\yourname\terraform-test
code C:\Users\yourname\terraform-test
```

### Step 3b — Create the MCP configuration file

In your open workspace folder, create a file at `.vscode/mcp.json`.

**If you installed globally (Option A):**

```json
{
  "servers": {
    "azure-terraform": {
      "command": "azure-terraform-mcp-server",
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

**If you installed from source (Option B):**

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

> **Important:** Replace `C:\\path\\to\\azure-terraform-mcp-server` with the actual path where you cloned the repo in Step 2 (e.g., `C:\\Users\\yourname\\Documents\\azure-terraform-mcp-server`).

> **Note:** The Azure `ARM_*` environment variables are only needed if you plan to test the aztfexport resource export scenarios.

> **Tip:** Setting `GITHUB_TOKEN` is optional but recommended to avoid GitHub API rate limits. You can create a personal access token at https://github.com/settings/tokens (no special scopes needed).

### Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub personal access token (avoids API rate limits) | No (recommended) |
| `MCP_WORKSPACE_ROOT` | Root directory for workspace operations | No |
| `ARM_SUBSCRIPTION_ID` | Azure subscription ID for aztfexport operations | No* |
| `ARM_TENANT_ID` | Azure tenant ID | No* |
| `ARM_CLIENT_ID` | Azure client/application ID | No* |
| `ARM_CLIENT_SECRET` | Azure client secret | No* |
| `TELEMETRY_ENABLED` | Enable/disable telemetry (`true`/`false`, default: `true`) | No |

*Required only for aztfexport resource export scenarios.

## 4. Verify the Server is Running

Open **GitHub Copilot Chat** in VS Code (Copilot Chat panel or `Ctrl+Shift+I`) and switch to **Agent mode**. You should see the MCP tools available (look for tool icons or type `@`).

Quick smoke test — type this in Copilot Chat (Agent mode):

```
Get the documentation for azurerm_storage_account
```

If the server is working, you should receive detailed Terraform documentation for the storage account resource.

---

## Registered Tools (14 total)

The server exposes the following MCP tools. All test scenarios below exercise these tools.

| Category | Tool Name | Description |
|----------|-----------|-------------|
| **Documentation** | `get_azurerm_provider_documentation` | AzureRM resource/data-source docs with arguments, attributes, examples |
| | `get_azapi_provider_documentation` | AzAPI resource docs with auto-generated HCL schemas and Terraform examples |
| | `list_avm_modules` | List all Azure Verified Modules |
| | `get_avm_latest_version` | Latest version of an AVM module |
| | `get_avm_versions` | All versions of an AVM module |
| | `get_avm_documentation` | README/docs for a specific AVM module version |
| **Resource Export** | `check_aztfexport_installation` | Check aztfexport and Terraform installation status |
| | `generate_aztfexport_resource_command` | Generate command to export a single Azure resource |
| | `generate_aztfexport_resource_group_command` | Generate command to export an entire resource group |
| | `generate_aztfexport_resources_by_query_command` | Generate command to export resources by Azure Resource Graph query |
| **Policy Validation** | `check_conftest_installation` | Check Conftest installation and optionally trigger auto-setup |
| | `generate_conftest_workspace_validation_command` | Generate command to validate Terraform files against policies |
| | `generate_conftest_workspace_plan_validation_command` | Generate command to validate Terraform plan files against policies |
| | `setup_conftest_environment` | One-step automated Conftest install + policy library download |

> **Command Generation Model:** The aztfexport and conftest tools return command structures (command, args, working directory, notes) for the agent to execute locally — they do **not** run commands server-side.

---

## 5. Test Scenarios

Please work through as many of the following scenarios as possible. For each one, note whether it **passed**, **failed**, or **partially worked**, and capture any error messages or unexpected behavior.

### Scenario 1 — AzureRM Provider Documentation

Test the `get_azurerm_provider_documentation` tool by asking Copilot (in Agent mode):

| # | Prompt to try | What to look for |
|---|--------------|-----------------|
| 1.1 | `Get documentation for azurerm_virtual_network` | Should return arguments, attributes, and example code |
| 1.2 | `Get the data source documentation for azurerm_subscription` | Should return data source docs (not resource) |
| 1.3 | `What arguments does azurerm_kubernetes_cluster accept?` | Should list all arguments with descriptions |
| 1.4 | `Show me the 'sku' argument details for azurerm_storage_account` | Should return details for that specific argument |
| 1.5 | `Get documentation for azurerm_nonexistent_resource_12345` | Should return a clear error, not crash |

### Scenario 2 — AzAPI Provider Documentation

Test the `get_azapi_provider_documentation` tool. Results should include auto-generated HCL schemas from Bicep type definitions **and** Terraform examples from the template-reference-generator repository when available.

| # | Prompt to try | What to look for |
|---|--------------|-----------------|
| 2.1 | `Get AzAPI documentation for Microsoft.Storage/storageAccounts` | Should return schema info plus Terraform examples |
| 2.2 | `Get AzAPI docs for Microsoft.Network/virtualNetworks` | Should return vnet schema with properties and examples |
| 2.3 | `Get AzAPI documentation for Microsoft.Compute/virtualMachines with API version 2024-07-01` | Should return docs for that specific API version |
| 2.4 | `Get AzAPI docs for Microsoft.FakeProvider/nonExistentType` | Should return a clear error or not-found message |

### Scenario 3 — Azure Verified Modules (AVM)

Test the AVM documentation tools (`list_avm_modules`, `get_avm_latest_version`, `get_avm_versions`, `get_avm_documentation`):

| # | Prompt to try | What to look for |
|---|--------------|-----------------|
| 3.1 | `List all available Azure Verified Modules` | Should return a list of modules with names, descriptions, and sources |
| 3.2 | `What is the latest version of avm-res-storage-storageaccount?` | Should return a version number |
| 3.3 | `Show all versions of avm-res-network-virtualnetwork` | Should return a list of versions with dates |
| 3.4 | `Get the documentation for avm-res-storage-storageaccount version 0.1.0` | Should return the module README with variables and outputs |
| 3.5 | `Get the latest version of avm-fake-nonexistent-module` | Should return a helpful not-found message |

### Scenario 4 — Aztfexport (Resource Export)

> **Requires:** `aztfexport` and `terraform` installed, plus Azure `ARM_*` environment variables set and an Azure subscription with resources. Tools use a **command generation model** — they return the command for the agent to execute, not run it directly.

| # | Prompt to try | What to look for |
|---|--------------|-----------------|
| 4.1 | `Check if aztfexport is installed` | Should report installation status, aztfexport version, and Terraform version. If not installed, should return installation help with platform-specific install commands |
| 4.2 | `Export the resource /subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.Storage/storageAccounts/<name> to Terraform` | Should return a command structure with `command`, `args`, `description`, and `notes` |
| 4.3 | `Export all resources in resource group my-rg to Terraform using the azapi provider` | Should return a resource group export command using `azapi` provider |
| 4.4 | `Export all storage accounts in my subscription using a resource graph query` | Should return a query-based export command |
| 4.5 | `Export resource group my-rg with a dry run and include role assignments` | Should include `--dry-run` and role assignment flags in the generated command |

> Replace `<sub-id>`, `<rg>`, and `<name>` with real Azure resource values.

### Scenario 5 — Conftest Policy Validation

Tools use a **command generation model** — they return conftest commands for the agent to execute locally, not run them directly on the server.

| # | Prompt to try | What to look for |
|---|--------------|-----------------|
| 5.1 | `Check if conftest is installed` | Should report installation status, version, and executable path. If not installed, should return platform-specific installation help |
| 5.2 | `Validate Terraform files in ./my-terraform-folder against Azure security policies` | Should return a command structure with `command`, `args`, `workspaceFolder`, `policySet`, and `notes` |
| 5.3 | `Validate Terraform files in ./infra using the avmsec policy set` | Should return a command targeting the `avmsec` policy set specifically |
| 5.4 | `Validate my Terraform plan file against Azure-Proactive-Resiliency-Library-v2 policies` | Should return a plan validation command with that policy set |
| 5.5 | `Validate Terraform files with high severity filter only` | Should include severity filter in the generated command |

### Scenario 6 — Conftest Environment Setup

Test the `setup_conftest_environment` tool — the automated one-step setup that handles Conftest installation and policy library download.

| # | Prompt to try | What to look for |
|---|--------------|-----------------|
| 6.1 | `Setup conftest environment in my workspace` | Should check Conftest installation, report status, and describe next steps. If `confirmInstall` is false, should prompt for confirmation before installing |
| 6.2 | `Setup conftest and install it automatically` | Should attempt platform-aware auto-installation (scoop/choco on Windows, brew on macOS, apt on Linux) and clone the Azure policy library |
| 6.3 | `Setup conftest environment but skip policy download` | Should install/verify Conftest but skip cloning the policy library |
| 6.4 | After setup, ask `Check if conftest is installed` again | Should confirm Conftest is installed with version info and show available policy sets (`avmsec`, `Azure-Proactive-Resiliency-Library-v2`) |

### Scenario 7 — Edge Cases & Error Handling

| # | Prompt to try | What to look for |
|---|--------------|-----------------|
| 7.1 | `Get documentation for a resource type with special characters: azurerm_$%^&` | Should fail gracefully with a clear error |
| 7.2 | `Get AVM documentation for a module that doesn't exist: avm-fake-module` | Should return a helpful not-found message |
| 7.3 | Ask multiple documentation questions in rapid succession | Server should handle concurrent requests without crashing |
| 7.4 | `Export resources from a resource group that doesn't exist` | Should generate the command; error happens at execution time |
| 7.5 | `Validate Terraform files in a folder that doesn't exist` | Should generate the command or return a clear error |
| 7.6 | `Get AzAPI docs for an invalid resource type format` | Should return a meaningful error about expected format (e.g., `Microsoft.Provider/resourceType`) |

---

## Quick Reference Card

| Action | Command |
|--------|---------|
| Install globally (from repo root) | `npm install -g .` |
| Install dependencies | `npm install` |
| Build | `npm run build` |
| Watch mode (auto-rebuild) | `npm run dev` |
| Start server (standalone) | `npm start` |
| Run unit tests | `npm test` |
| Run integration tests | `npm run test:integration` |
| Run all tests | `npm run test:all` |
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |
| Clean build artifacts | `npm run clean` |
| Start MCP in VS Code | Command Palette → "MCP: List Servers" → Start |

---

Thank you for participating in the bug bash! Your feedback is invaluable in making this tool production-ready. 🎯
