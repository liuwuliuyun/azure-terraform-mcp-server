/**
 * Integration tests for conftest setup orchestrator.
 *
 * These tests verify the complete setup flow including:
 * - Installation detection
 * - Policy library management
 * - Comprehensive status reporting
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  setupConftestEnvironment,
  checkConftestInstallationWithSetup,
} from '../../src/tools/conftest-setup.js';
import {
  clonePolicyLibrary,
  updatePolicyLibrary,
  getPolicyStatus,
} from '../../src/tools/policy-manager.js';
import { resetCacheManager } from '../../src/core/cache-manager.js';

/**
 * Create a temporary directory for testing.
 */
function createTempDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Clean up a temporary directory.
 */
function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('conftest-setup', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir('conftest-setup-test');
    resetCacheManager();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('setupConftestEnvironment', () => {
    it('should return a SetupEnvironmentResult with all required fields', async () => {
      const result = await setupConftestEnvironment({
        workspacePath: tempDir,
        confirmInstall: false,
        skipPolicies: true,
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('conftestInstalled');
      expect(result).toHaveProperty('policiesAvailable');
      expect(result).toHaveProperty('actionsTaken');
      expect(result).toHaveProperty('requiresRestart');
      expect(result).toHaveProperty('readyToValidate');
      expect(result).toHaveProperty('executedAt');
      expect(result).toHaveProperty('duration');
    });

    it('should detect conftest installation status', async () => {
      const result = await setupConftestEnvironment({
        workspacePath: tempDir,
        confirmInstall: false,
        skipPolicies: true,
      });

      expect(typeof result.conftestInstalled).toBe('boolean');
      if (result.conftestInstalled) {
        expect(result.conftestVersion).toBeDefined();
        expect(result.conftestPath).toBeDefined();
      }
    });

    it('should skip policy checks when skipPolicies is true', async () => {
      const result = await setupConftestEnvironment({
        workspacePath: tempDir,
        confirmInstall: false,
        skipPolicies: true,
      });

      expect(result.policiesAvailable).toBe(false);
      expect(result.readyToValidate).toBe(result.conftestInstalled);
    });

    it('should include action history', async () => {
      const result = await setupConftestEnvironment({
        workspacePath: tempDir,
        confirmInstall: false,
        skipPolicies: true,
      });

      expect(Array.isArray(result.actionsTaken)).toBe(true);
      for (const action of result.actionsTaken) {
        expect(['conftest-install', 'policy-clone', 'policy-update']).toContain(action);
      }
    });

    it('should track execution time', async () => {
      const result = await setupConftestEnvironment({
        workspacePath: tempDir,
        confirmInstall: false,
        skipPolicies: true,
      });

      expect(result.executedAt).toBeInstanceOf(Date);
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle verbose mode without errors', async () => {
      const result = await setupConftestEnvironment({
        workspacePath: tempDir,
        confirmInstall: false,
        skipPolicies: true,
        verbose: true,
      });

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should include nextSteps when setup incomplete', async () => {
      const result = await setupConftestEnvironment({
        workspacePath: tempDir,
        confirmInstall: false,
        skipPolicies: false,
      });

      if (!result.readyToValidate) {
        expect(result.nextSteps).toBeDefined();
        expect(Array.isArray(result.nextSteps)).toBe(true);
        expect(result.nextSteps!.length).toBeGreaterThan(0);
      }
    });

    it('should not require restart when no installation attempted', async () => {
      const result = await setupConftestEnvironment({
        workspacePath: tempDir,
        confirmInstall: false,
        skipPolicies: true,
      });

      expect(result.requiresRestart).toBe(false);
    });
  });

  describe('checkConftestInstallationWithSetup', () => {
    it('should return setup result with autoSetup=true', async () => {
      const result = await checkConftestInstallationWithSetup(tempDir, true);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('conftestInstalled');
      expect(result).toHaveProperty('executedAt');
    });

    it('should return simple check result with autoSetup=false', async () => {
      const result = await checkConftestInstallationWithSetup(tempDir, false);

      expect(result).toBeDefined();
      expect(typeof result.conftestInstalled).toBe('boolean');
      expect(result.actionsTaken).toBeDefined();
    });

    it('should handle missing workspace path', async () => {
      const result = await checkConftestInstallationWithSetup(undefined, false);

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('Policy management integration', () => {
    it.skipIf(process.env.SKIP_POLICY_TESTS === 'true')(
      'should detect missing policy library',
      async () => {
        const status = getPolicyStatus(tempDir);

        expect(status).toBeDefined();
        expect(status.available).toBe(false);
        expect(status.policySets).toEqual([]);
      }
    );

    it.skipIf(process.env.SKIP_POLICY_TESTS === 'true')(
      'should handle policy clone when git is available',
      async () => {
        // This test requires git to be installed
        const result = await clonePolicyLibrary(tempDir);

        if (result.success) {
          expect(result.path).toBeDefined();
          expect(Array.isArray(result.policySets)).toBe(true);
        } else {
          // If clone fails, should still return proper error info
          expect(result.error).toBeDefined();
        }
      },
      300000 // 5 minute timeout for clone
    );
  });

  describe('Status message building', () => {
    it('should include conftest status in message', async () => {
      const result = await setupConftestEnvironment({
        workspacePath: tempDir,
        confirmInstall: false,
        skipPolicies: true,
      });

      expect(result.message).toBeDefined();
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);

      // Should mention conftest status
      if (result.conftestInstalled) {
        expect(result.message.toLowerCase()).toContain('conftest');
      }
    });

    it('should include restart notice when needed', async () => {
      const result = await setupConftestEnvironment({
        workspacePath: tempDir,
        confirmInstall: false,
        skipPolicies: true,
      });

      if (result.requiresRestart) {
        expect(result.restartInstructions).toBeDefined();
      }
    });
  });
});
