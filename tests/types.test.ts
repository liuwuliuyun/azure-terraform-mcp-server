/**
 * Tests for core/types.ts - Zod schema validation
 */

import { describe, it, expect } from 'vitest';
import {
  GetAzureRMDocumentationParams,
  GetAzAPIDocumentationParams,
  ListAvmModulesParams,
  GetAvmLatestVersionParams,
  GetAvmVersionsParams,
  GetAvmDocumentationParams,
  CheckAztfexportInstallationParams,
  ExportAzureResourceParams,
  ExportAzureResourceGroupParams,
  ExportAzureResourcesByQueryParams,
  CheckConftestInstallationParams,
  SetupConftestEnvironmentParams,
  RunConftestWorkspaceValidationParams,
  RunConftestWorkspacePlanValidationParams,
} from '../src/core/types.js';

// ==========================================
// GetAzureRMDocumentationParams
// ==========================================

describe('GetAzureRMDocumentationParams', () => {
  it('should validate valid input with required fields only', () => {
    const result = GetAzureRMDocumentationParams.safeParse({
      resourceTypeName: 'azurerm_storage_account',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resourceTypeName).toBe('azurerm_storage_account');
      expect(result.data.docType).toBe('resource'); // default
    }
  });

  it('should validate valid input with all fields', () => {
    const result = GetAzureRMDocumentationParams.safeParse({
      resourceTypeName: 'azurerm_virtual_machine',
      docType: 'data-source',
      argumentName: 'name',
      attributeName: 'id',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.docType).toBe('data-source');
      expect(result.data.argumentName).toBe('name');
      expect(result.data.attributeName).toBe('id');
    }
  });

  it('should reject invalid docType', () => {
    const result = GetAzureRMDocumentationParams.safeParse({
      resourceTypeName: 'azurerm_storage_account',
      docType: 'invalid',
    });

    expect(result.success).toBe(false);
  });

  it('should reject missing resourceTypeName', () => {
    const result = GetAzureRMDocumentationParams.safeParse({});

    expect(result.success).toBe(false);
  });
});

// ==========================================
// GetAzAPIDocumentationParams
// ==========================================

describe('GetAzAPIDocumentationParams', () => {
  it('should validate valid input', () => {
    const result = GetAzAPIDocumentationParams.safeParse({
      resourceTypeName: 'Microsoft.Storage/storageAccounts',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resourceTypeName).toBe('Microsoft.Storage/storageAccounts');
    }
  });

  it('should accept optional apiVersion', () => {
    const result = GetAzAPIDocumentationParams.safeParse({
      resourceTypeName: 'Microsoft.Storage/storageAccounts',
      apiVersion: '2023-01-01',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apiVersion).toBe('2023-01-01');
    }
  });

  it('should reject missing resourceTypeName', () => {
    const result = GetAzAPIDocumentationParams.safeParse({
      apiVersion: '2023-01-01',
    });

    expect(result.success).toBe(false);
  });
});

// ==========================================
// AVM Params
// ==========================================

describe('ListAvmModulesParams', () => {
  it('should validate empty object', () => {
    const result = ListAvmModulesParams.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('GetAvmLatestVersionParams', () => {
  it('should validate valid moduleName', () => {
    const result = GetAvmLatestVersionParams.safeParse({
      moduleName: 'avm-res-storage-storageaccount',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.moduleName).toBe('avm-res-storage-storageaccount');
    }
  });

  it('should reject missing moduleName', () => {
    const result = GetAvmLatestVersionParams.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('GetAvmVersionsParams', () => {
  it('should validate valid moduleName', () => {
    const result = GetAvmVersionsParams.safeParse({
      moduleName: 'avm-res-compute-virtualmachine',
    });

    expect(result.success).toBe(true);
  });
});

describe('GetAvmDocumentationParams', () => {
  it('should validate valid input', () => {
    const result = GetAvmDocumentationParams.safeParse({
      moduleName: 'avm-res-storage-storageaccount',
      moduleVersion: '0.1.0',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.moduleName).toBe('avm-res-storage-storageaccount');
      expect(result.data.moduleVersion).toBe('0.1.0');
    }
  });

  it('should reject missing moduleVersion', () => {
    const result = GetAvmDocumentationParams.safeParse({
      moduleName: 'avm-res-storage-storageaccount',
    });

    expect(result.success).toBe(false);
  });
});

// ==========================================
// Aztfexport Params
// ==========================================

describe('CheckAztfexportInstallationParams', () => {
  it('should validate empty object', () => {
    const result = CheckAztfexportInstallationParams.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('ExportAzureResourceParams', () => {
  it('should validate with required fields only', () => {
    const result = ExportAzureResourceParams.safeParse({
      resourceId: '/subscriptions/sub-id/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resourceId).toContain('/subscriptions/');
      expect(result.data.provider).toBe('azurerm'); // default
      expect(result.data.dryRun).toBe(false); // default
      expect(result.data.parallelism).toBe(10); // default
    }
  });

  it('should validate with all fields', () => {
    const result = ExportAzureResourceParams.safeParse({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm',
      outputFolderName: 'output',
      provider: 'azapi',
      resourceName: 'my_vm',
      resourceType: 'azapi_resource',
      dryRun: true,
      includeRoleAssignment: true,
      parallelism: 5,
      continueOnError: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider).toBe('azapi');
      expect(result.data.dryRun).toBe(true);
      expect(result.data.parallelism).toBe(5);
    }
  });

  it('should reject invalid provider', () => {
    const result = ExportAzureResourceParams.safeParse({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
      provider: 'invalid',
    });

    expect(result.success).toBe(false);
  });

  it('should reject parallelism out of range', () => {
    const result = ExportAzureResourceParams.safeParse({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
      parallelism: 100,
    });

    expect(result.success).toBe(false);
  });

  it('should accept parallelism at boundaries', () => {
    const result1 = ExportAzureResourceParams.safeParse({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
      parallelism: 1,
    });
    expect(result1.success).toBe(true);

    const result50 = ExportAzureResourceParams.safeParse({
      resourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
      parallelism: 50,
    });
    expect(result50.success).toBe(true);
  });
});

describe('ExportAzureResourceGroupParams', () => {
  it('should validate with required fields only', () => {
    const result = ExportAzureResourceGroupParams.safeParse({
      resourceGroupName: 'my-resource-group',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resourceGroupName).toBe('my-resource-group');
      expect(result.data.provider).toBe('azurerm');
    }
  });

  it('should validate with patterns', () => {
    const result = ExportAzureResourceGroupParams.safeParse({
      resourceGroupName: 'rg-production',
      namePattern: 'prod_{name}',
      typePattern: 'Microsoft.Storage/*',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.namePattern).toBe('prod_{name}');
      expect(result.data.typePattern).toBe('Microsoft.Storage/*');
    }
  });
});

describe('ExportAzureResourcesByQueryParams', () => {
  it('should validate with required fields only', () => {
    const result = ExportAzureResourcesByQueryParams.safeParse({
      query: "type == 'Microsoft.Storage/storageAccounts'",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toContain('Microsoft.Storage');
    }
  });
});

// ==========================================
// Conftest Params
// ==========================================

describe('CheckConftestInstallationParams', () => {
  it('should validate empty object', () => {
    const result = CheckConftestInstallationParams.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('SetupConftestEnvironmentParams', () => {
  it('should validate empty object with defaults', () => {
    const result = SetupConftestEnvironmentParams.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confirmInstall).toBe(false);
      expect(result.data.skipPolicies).toBe(false);
    }
  });

  it('should validate with all fields', () => {
    const result = SetupConftestEnvironmentParams.safeParse({
      workspacePath: '/path/to/workspace',
      confirmInstall: true,
      skipPolicies: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workspacePath).toBe('/path/to/workspace');
      expect(result.data.confirmInstall).toBe(true);
      expect(result.data.skipPolicies).toBe(true);
    }
  });

  it('should accept optional workspacePath', () => {
    const result = SetupConftestEnvironmentParams.safeParse({
      confirmInstall: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workspacePath).toBeUndefined();
    }
  });
});

describe('RunConftestWorkspaceValidationParams', () => {
  it('should validate with required fields only', () => {
    const result = RunConftestWorkspaceValidationParams.safeParse({
      workspaceFolder: '/path/to/workspace',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workspaceFolder).toBe('/path/to/workspace');
      expect(result.data.policySet).toBe('all'); // default
    }
  });

  it('should validate with all fields', () => {
    const result = RunConftestWorkspaceValidationParams.safeParse({
      workspaceFolder: 'terraform',
      policySet: 'avmsec',
      severityFilter: 'high',
      customPolicies: '/policies/custom,/policies/extra',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.policySet).toBe('avmsec');
      expect(result.data.severityFilter).toBe('high');
      expect(result.data.customPolicies).toContain('/policies/custom');
    }
  });

  it('should reject invalid policySet', () => {
    const result = RunConftestWorkspaceValidationParams.safeParse({
      workspaceFolder: 'terraform',
      policySet: 'invalid-policy',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid severityFilter', () => {
    const result = RunConftestWorkspaceValidationParams.safeParse({
      workspaceFolder: 'terraform',
      severityFilter: 'critical',
    });

    expect(result.success).toBe(false);
  });

  it('should accept all valid policySet values', () => {
    const policySets = ['all', 'Azure-Proactive-Resiliency-Library-v2', 'avmsec'];

    for (const policySet of policySets) {
      const result = RunConftestWorkspaceValidationParams.safeParse({
        workspaceFolder: 'terraform',
        policySet,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept all valid severityFilter values', () => {
    const severities = ['high', 'medium', 'low', 'info'];

    for (const severityFilter of severities) {
      const result = RunConftestWorkspaceValidationParams.safeParse({
        workspaceFolder: 'terraform',
        severityFilter,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('RunConftestWorkspacePlanValidationParams', () => {
  it('should validate with required fields only', () => {
    const result = RunConftestWorkspacePlanValidationParams.safeParse({
      folderName: 'terraform-plans',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.folderName).toBe('terraform-plans');
      expect(result.data.policySet).toBe('all');
    }
  });

  it('should validate with all fields', () => {
    const result = RunConftestWorkspacePlanValidationParams.safeParse({
      folderName: 'plans',
      policySet: 'Azure-Proactive-Resiliency-Library-v2',
      severityFilter: 'medium',
      customPolicies: '/custom/policy.rego',
    });

    expect(result.success).toBe(true);
  });
});
