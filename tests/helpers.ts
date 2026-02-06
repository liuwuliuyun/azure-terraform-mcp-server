/**
 * Test utilities and helpers for Azure Terraform MCP Server tests.
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

/**
 * Create a temporary directory for testing.
 */
export function createTempDir(prefix = 'mcp-test-'): string {
  const tempPath = join(tmpdir(), `${prefix}${randomUUID()}`);
  mkdirSync(tempPath, { recursive: true });
  return tempPath;
}

/**
 * Clean up a temporary directory.
 */
export function cleanupTempDir(path: string): void {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

/**
 * Create a file in a directory with the given content.
 */
export function createFile(dir: string, filename: string, content: string): string {
  const filePath = join(dir, filename);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Create multiple files in a directory.
 */
export function createFiles(dir: string, files: Record<string, string>): void {
  for (const [filename, content] of Object.entries(files)) {
    createFile(dir, filename, content);
  }
}

/**
 * Create a subdirectory in a directory.
 */
export function createSubDir(dir: string, name: string): string {
  const subDir = join(dir, name);
  mkdirSync(subDir, { recursive: true });
  return subDir;
}

/**
 * Mock environment variables for testing.
 * Returns a cleanup function to restore original values.
 */
export function mockEnv(env: Record<string, string | undefined>): () => void {
  const original: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(env)) {
    original[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

/**
 * Sample Terraform file content for testing.
 */
export const SAMPLE_TF_CONTENT = `
resource "azurerm_resource_group" "example" {
  name     = "example-resources"
  location = "West Europe"

  tags = {
    Environment = "Development"
  }
}

resource "azurerm_storage_account" "example" {
  name                     = "examplestorage"
  resource_group_name      = azurerm_resource_group.example.name
  location                 = azurerm_resource_group.example.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}
`;

/**
 * Sample AzureRM markdown documentation for testing parsing.
 */
export const SAMPLE_AZURERM_DOCS = `---
subcategory: "Storage"
layout: "azurerm"
page_title: "Azure Resource Manager: azurerm_storage_account"
description: |-
  Manages an Azure Storage Account.
---

# azurerm_storage_account

Manages an Azure Storage Account.

## Example Usage

\`\`\`hcl
resource "azurerm_resource_group" "example" {
  name     = "example-resources"
  location = "West Europe"
}

resource "azurerm_storage_account" "example" {
  name                     = "storageaccountname"
  resource_group_name      = azurerm_resource_group.example.name
  location                 = azurerm_resource_group.example.location
  account_tier             = "Standard"
  account_replication_type = "GRS"

  tags = {
    environment = "staging"
  }
}
\`\`\`

## Argument Reference

The following arguments are supported:

* \`name\` - (Required) Specifies the name of the storage account.

* \`resource_group_name\` - (Required) The name of the resource group.

* \`location\` - (Required) Specifies the supported Azure location.

* \`account_tier\` - (Required) Defines the Tier to use for this storage account.

* \`account_replication_type\` - (Required) Defines the type of replication.

* \`tags\` - (Optional) A mapping of tags to assign to the resource.

## Attributes Reference

In addition to the Arguments listed above - the following Attributes are exported:

* \`id\` - The ID of the Storage Account.

* \`primary_blob_endpoint\` - The endpoint URL for blob storage.

* \`primary_access_key\` - The primary access key for the storage account.

## Timeouts

The \`timeouts\` block allows you to specify timeouts for certain actions:

* \`create\` - (Defaults to 60 minutes) Used when creating the Storage Account.
* \`update\` - (Defaults to 60 minutes) Used when updating the Storage Account.
* \`delete\` - (Defaults to 60 minutes) Used when deleting the Storage Account.

-> **NOTE:** This is an important note about the resource.

~> **NOTE:** This is another note with tilde.
`;

/**
 * Sample JSON plan for Conftest testing.
 */
export const SAMPLE_TF_PLAN_JSON = {
  format_version: '1.2',
  terraform_version: '1.5.0',
  planned_values: {
    root_module: {
      resources: [
        {
          address: 'azurerm_storage_account.example',
          type: 'azurerm_storage_account',
          name: 'example',
          provider_name: 'registry.terraform.io/hashicorp/azurerm',
          values: {
            name: 'examplestorage',
            account_tier: 'Standard',
            account_replication_type: 'LRS',
          },
        },
      ],
    },
  },
  resource_changes: [
    {
      address: 'azurerm_storage_account.example',
      type: 'azurerm_storage_account',
      change: {
        actions: ['create'],
      },
    },
  ],
};
