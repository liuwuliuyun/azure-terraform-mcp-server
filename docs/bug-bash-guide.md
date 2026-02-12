# Azure Terraform MCP Server — Bug Bash Guide

Welcome! This guide will walk you through setting up and testing the **Azure Terraform MCP Server** locally in VS Code. No prior Terraform or MCP experience is required — just follow the steps below.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone & Set Up the Server](#2-clone--set-up-the-server)
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
| **Conftest** | Policy validation tests | https://www.conftest.dev/ (or let the server auto-install it) |
| **Terraform** | Plan generation for conftest | https://www.terraform.io/downloads |


## 2. Clone & Set Up the Server

Open a terminal (PowerShell, Command Prompt, or VS Code integrated terminal) and run:

```powershell
# 1. Clone the repository
git clone https://github.com/liuwuliuyun/azure-terraform-mcp-server.git

# 2. Install dependencies
cd azure-terraform-mcp-server
npm install
```

## 3. Configure & Start the MCP Server in VS Code

### Step 3a — Open any folder in VS Code

You can open **any folder** (or create a new one) in VS Code — this will be your testing workspace. It does **not** need to be the cloned repo folder.

For example, create a fresh test folder and open it:

```powershell
mkdir C:\Users\yourname\terraform-test
code C:\Users\yourname\terraform-test
```

### Step 3b — Create the MCP configuration file

In your open workspace folder, create a file at `.vscode/mcp.json` with the following content:

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

> **Note:** The `npm start` command will automatically build and launch the server. The Azure `ARM_*` environment variables are only needed if you plan to test the aztfexport resource export scenarios.

> **Tip:** Setting `GITHUB_TOKEN` is optional but recommended to avoid GitHub API rate limits. You can create a personal access token at https://github.com/settings/tokens (no special scopes needed).

## 4. Verify the Server is Running

Open **GitHub Copilot Chat** in VS Code (Copilot Chat panel or `Ctrl+Shift+I`) and switch to **Agent mode**. You should see the MCP tools available (look for tool icons or type `@`).

Quick smoke test — type this in Copilot Chat (Agent mode):

```
Get the documentation for azurerm_storage_account
```

If the server is working, you should receive detailed Terraform documentation for the storage account resource.

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
| 1.4 | `Get documentation for azurerm_nonexistent_resource_12345` | Should return a clear error, not crash |

### Scenario 2 — AzAPI Provider Documentation

Test the `get_azapi_provider_documentation` tool:

| # | Prompt to try | What to look for |
|---|--------------|-----------------|
| 2.1 | `Get AzAPI documentation for Microsoft.Storage/storageAccounts` | Should return Azure REST API schema info |
| 2.2 | `Get AzAPI docs for Microsoft.Network/virtualNetworks` | Should return vnet schema |
| 2.3 | `Get AzAPI documentation for Microsoft.Compute/virtualMachines with API version 2024-07-01` | Should return docs for that specific API version |

### Scenario 3 — Azure Verified Modules (AVM)

Test the AVM documentation tools:

| # | Prompt to try | What to look for |
|---|--------------|-----------------|
| 3.1 | `List all available Azure Verified Modules` | Should return a list of AVM modules |
| 3.2 | `What is the latest version of avm-res-storage-storageaccount?` | Should return a version number |
| 3.3 | `Show all versions of avm-res-network-virtualnetwork` | Should return a list of versions |
| 3.4 | `Get the documentation for avm-res-storage-storageaccount version 0.1.0` | Should return the module README with variables and outputs |

### Scenario 4 — Aztfexport (Resource Export)

> **Requires:** `aztfexport` and `terraform` installed, plus an Azure subscription with resources.

| # | Prompt to try | What to look for |
|---|--------------|-----------------|
| 4.1 | `Check if aztfexport is installed` | Should report installation status and version |
| 4.2 | `Export the resource /subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.Storage/storageAccounts/<name> to Terraform` | Should generate an aztfexport command (not execute it directly) |
| 4.3 | `Export all resources in resource group my-rg to Terraform` | Should generate a resource group export command |
| 4.4 | `Export all storage accounts in my subscription using a resource graph query` | Should generate a query-based export command |

> Replace `<sub-id>`, `<rg>`, and `<name>` with real Azure resource values.

### Scenario 5 — Conftest Policy Validation

| # | Prompt to try | What to look for |
|---|--------------|-----------------|
| 5.1 | `Check if conftest is installed` | Should report installation status |
| 5.2 | `Setup conftest environment in my workspace` | Should attempt to install conftest and download policies |
| 5.3 | `Validate Terraform files in ./my-terraform-folder against Azure security policies` | Should generate a conftest validation command |
| 5.4 | `Validate my Terraform plan against AVM security policies` | Should generate a plan validation command |

### Scenario 6 — Edge Cases & Error Handling

| # | Prompt to try | What to look for |
|---|--------------|-----------------|
| 6.1 | `Get documentation for a resource type with special characters: azurerm_$%^&` | Should fail gracefully with a clear error |
| 6.2 | `Get AVM documentation for a module that doesn't exist: avm-fake-module` | Should return a helpful not-found message |
| 6.3 | Ask multiple documentation questions in rapid succession | Server should handle concurrent requests without crashing |
| 6.4 | `Export resources from a resource group that doesn't exist` | Should generate the command; error happens at execution time |

---

## Quick Reference Card

| Action | Command |
|--------|---------|
| Install dependencies | `npm install` |
| Build | `npm run build` |
| Rebuild after code changes | `npm run build` |
| Start server (standalone) | `npm start` |
| Run unit tests | `npm test` |
| Run all tests | `npm run test:all` |
| Start MCP in VS Code | Command Palette → "MCP: List Servers" → Start |

---

Thank you for participating in the bug bash! Your feedback is invaluable in making this tool production-ready. 🎯
