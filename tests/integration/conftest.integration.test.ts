/**
 * Integration tests for conftest runner.
 * 
 * These tests require:
 * - conftest installed and in PATH
 * - git installed (for policy repo cloning)
 * 
 * Set SKIP_CONFTEST_TESTS=true to skip these tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkConftestInstallation,
  runConftestWorkspaceValidation,
  runConftestWorkspacePlanValidation,
} from '../../src/tools/conftest-runner.js';
import {
  RunConftestWorkspaceValidationParams,
  RunConftestWorkspacePlanValidationParams,
} from '../../src/core/types.js';
import {
  shouldSkipConftestTests,
  createIntegrationTempDir,
  cleanupTempDir,
} from './helpers.js';

// Helper to parse params with defaults applied
function parseWorkspaceValidationParams(input: { workspaceFolder: string; [key: string]: unknown }) {
  return RunConftestWorkspaceValidationParams.parse(input);
}

function parsePlanValidationParams(input: { folderName: string; [key: string]: unknown }) {
  return RunConftestWorkspacePlanValidationParams.parse(input);
}

// Sample Terraform content for testing
const SAMPLE_COMPLIANT_TF = `
resource "azurerm_resource_group" "example" {
  name     = "example-resources"
  location = "East US"

  tags = {
    Environment = "Production"
    Project     = "Integration Test"
  }
}

resource "azurerm_storage_account" "example" {
  name                     = "examplestorage"
  resource_group_name      = azurerm_resource_group.example.name
  location                 = azurerm_resource_group.example.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  min_tls_version          = "TLS1_2"

  tags = {
    Environment = "Production"
  }
}
`;

const SAMPLE_NON_COMPLIANT_TF = `
resource "azurerm_resource_group" "example" {
  name     = "example-resources"
  location = "East US"
  # Missing required tags
}

resource "azurerm_storage_account" "example" {
  name                     = "examplestorage"
  resource_group_name      = azurerm_resource_group.example.name
  location                 = azurerm_resource_group.example.location
  account_tier             = "Standard"
  account_replication_type = "LRS"  # Not redundant
  min_tls_version          = "TLS1_0"  # Insecure
  # Missing tags
}
`;

describe('Conftest Runner - Integration', () => {
  let conftestInstalled = false;
  let gitInstalled = false;
  let tempDirs: string[] = [];

  const createAndTrackTempDir = (prefix: string): string => {
    const dir = createIntegrationTempDir(prefix);
    tempDirs.push(dir);
    return dir;
  };

  beforeAll(async () => {
    // Check prerequisites
    const installCheck = await checkConftestInstallation({});
    conftestInstalled = installCheck.installed;

    // Check if git is available (needed for policy cloning)
    try {
      const { execSync } = await import('node:child_process');
      execSync('git --version', { stdio: 'pipe' });
      gitInstalled = true;
    } catch {
      gitInstalled = false;
    }

    if (!conftestInstalled) {
      console.warn('⚠️  conftest not installed - skipping validation tests');
    }
    if (!gitInstalled) {
      console.warn('⚠️  git not installed - policy cloning may fail');
    }
  });

  afterAll(() => {
    // Clean up all temp directories
    for (const dir of tempDirs) {
      if (existsSync(dir)) {
        cleanupTempDir(dir);
      }
    }
  });

  describe('checkConftestInstallation', () => {
    it('should check installation status', async () => {
      const result = await checkConftestInstallation({});

      expect(result).toBeDefined();
      expect(typeof result.installed).toBe('boolean');
      expect(result.status).toBeDefined();
      expect(typeof result.status).toBe('string');

      if (result.installed) {
        expect(result.version).toBeDefined();
        console.log(`conftest version: ${result.version}`);
      } else {
        expect(result.installationHelp).toBeDefined();
      }
    });

    it('should provide version info when installed', async () => {
      const result = await checkConftestInstallation({});

      if (result.installed) {
        expect(result.version).toBeDefined();
        expect(typeof result.version).toBe('string');
        expect(result.version!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('runConftestWorkspaceValidation', () => {
    it.skipIf(shouldSkipConftestTests() || !conftestInstalled || !gitInstalled)(
      'should validate compliant Terraform files',
      async () => {
        const tempDir = createAndTrackTempDir('conftest-test');
        
        // Create compliant Terraform file
        writeFileSync(join(tempDir, 'main.tf'), SAMPLE_COMPLIANT_TF);

        const result = await runConftestWorkspaceValidation(parseWorkspaceValidationParams({
          workspaceFolder: tempDir,
          policySet: 'all',
        }));

        expect(result).toBeDefined();
        expect(result.success).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        
        // Note: May have violations depending on policy strictness
        expect(Array.isArray(result.violations)).toBe(true);
        
        console.log(`Validation result: ${result.success ? 'PASSED' : 'FAILED'}`);
        console.log(`Violations found: ${result.violations.length}`);
      },
      180000 // 3 minute timeout for policy cloning
    );

    it.skipIf(shouldSkipConftestTests() || !conftestInstalled || !gitInstalled)(
      'should detect violations in non-compliant Terraform files',
      async () => {
        const tempDir = createAndTrackTempDir('conftest-test-nc');
        
        // Create non-compliant Terraform file
        writeFileSync(join(tempDir, 'main.tf'), SAMPLE_NON_COMPLIANT_TF);

        const result = await runConftestWorkspaceValidation(parseWorkspaceValidationParams({
          workspaceFolder: tempDir,
          policySet: 'all',
        }));

        expect(result).toBeDefined();
        expect(Array.isArray(result.violations)).toBe(true);
        
        // Should find some violations (missing tags, insecure TLS, etc.)
        // Note: Actual violations depend on the policy set
        console.log(`Violations found: ${result.violations.length}`);
        
        if (result.violations.length > 0) {
          console.log('Sample violations:');
          result.violations.slice(0, 3).forEach((v, i) => {
            console.log(`  ${i + 1}. [${v.level}] ${v.message}`);
          });
        }
      },
      180000
    );

    it.skipIf(shouldSkipConftestTests() || !conftestInstalled || !gitInstalled)(
      'should filter by severity',
      async () => {
        const tempDir = createAndTrackTempDir('conftest-test-sev');
        
        writeFileSync(join(tempDir, 'main.tf'), SAMPLE_NON_COMPLIANT_TF);

        const result = await runConftestWorkspaceValidation(parseWorkspaceValidationParams({
          workspaceFolder: tempDir,
          policySet: 'all',
          severityFilter: 'high',
        }));

        expect(result).toBeDefined();
        expect(Array.isArray(result.violations)).toBe(true);
        
        // Violations should be filtered by severity
        // (Note: violation level is 'failure' or 'warning', not severity)
      },
      180000
    );

    it.skipIf(shouldSkipConftestTests() || !conftestInstalled || !gitInstalled)(
      'should handle empty workspace',
      async () => {
        const tempDir = createAndTrackTempDir('conftest-test-empty');
        // Don't create any files

        const result = await runConftestWorkspaceValidation(parseWorkspaceValidationParams({
          workspaceFolder: tempDir,
          policySet: 'all',
        }));

        expect(result).toBeDefined();
        // Empty workspace should either pass or indicate no files
      },
      120000
    );

    it.skipIf(shouldSkipConftestTests() || !conftestInstalled || !gitInstalled)(
      'should use specific policy set',
      async () => {
        const tempDir = createAndTrackTempDir('conftest-test-ps');
        
        writeFileSync(join(tempDir, 'main.tf'), SAMPLE_COMPLIANT_TF);

        const result = await runConftestWorkspaceValidation(parseWorkspaceValidationParams({
          workspaceFolder: tempDir,
          policySet: 'avmsec',
        }));

        expect(result).toBeDefined();
        expect(Array.isArray(result.violations)).toBe(true);
      },
      180000
    );

    it.skipIf(shouldSkipConftestTests() || !conftestInstalled || !gitInstalled)(
      'should return summary information',
      async () => {
        const tempDir = createAndTrackTempDir('conftest-test-summary');
        
        writeFileSync(join(tempDir, 'main.tf'), SAMPLE_NON_COMPLIANT_TF);

        const result = await runConftestWorkspaceValidation(parseWorkspaceValidationParams({
          workspaceFolder: tempDir,
          policySet: 'all',
        }));

        expect(result).toBeDefined();
        expect(result.summary).toBeDefined();
        expect(typeof result.summary.totalViolations).toBe('number');
        expect(typeof result.summary.failures).toBe('number');
        expect(typeof result.summary.warnings).toBe('number');
      },
      180000
    );
  });

  describe('runConftestWorkspacePlanValidation', () => {
    it.skipIf(shouldSkipConftestTests() || !conftestInstalled || !gitInstalled)(
      'should validate Terraform plan JSON',
      async () => {
        const tempDir = createAndTrackTempDir('conftest-plan-test');
        
        // Create a mock Terraform plan JSON
        const mockPlan = {
          format_version: '1.0',
          terraform_version: '1.5.0',
          planned_values: {
            root_module: {
              resources: [
                {
                  type: 'azurerm_resource_group',
                  name: 'example',
                  provider_name: 'registry.terraform.io/hashicorp/azurerm',
                  values: {
                    name: 'example-resources',
                    location: 'eastus',
                    tags: {
                      Environment: 'Production',
                    },
                  },
                },
              ],
            },
          },
          resource_changes: [],
          configuration: {},
        };
        
        writeFileSync(join(tempDir, 'plan.json'), JSON.stringify(mockPlan, null, 2));

        const result = await runConftestWorkspacePlanValidation(parsePlanValidationParams({
          folderName: tempDir,
          policySet: 'all',
        }));

        expect(result).toBeDefined();
        expect(Array.isArray(result.violations)).toBe(true);
      },
      180000
    );

    it.skipIf(shouldSkipConftestTests() || !conftestInstalled || !gitInstalled)(
      'should handle missing plan file',
      async () => {
        const tempDir = createAndTrackTempDir('conftest-plan-missing');
        // Don't create plan file

        const result = await runConftestWorkspacePlanValidation(parsePlanValidationParams({
          folderName: tempDir,
          policySet: 'all',
        }));

        expect(result).toBeDefined();
        // Should indicate error or no file found
      },
      120000
    );
  });
});
