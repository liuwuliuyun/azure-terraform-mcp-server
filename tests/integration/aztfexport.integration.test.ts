/**
 * Integration tests for aztfexport runner.
 * 
 * These tests require:
 * - aztfexport installed and in PATH
 * - terraform installed and in PATH
 * - Azure credentials configured (ARM_* environment variables)
 * - An active Azure subscription with resources to export
 * 
 * Set SKIP_AZTFEXPORT_TESTS=true to skip these tests.
 */

import { describe, it, expect } from 'vitest';
import {
  checkAztfexportInstallation,
} from '../../src/tools/aztfexport-runner.js';

describe('aztfexport Runner - Integration', () => {

  describe('checkAztfexportInstallation', () => {
    it('should check installation status', async () => {
      const result = await checkAztfexportInstallation({});

      expect(result).toBeDefined();
      expect(typeof result.installed).toBe('boolean');
      expect(result.status).toBeDefined();
      expect(typeof result.status).toBe('string');

      if (result.installed) {
        expect(result.aztfexportVersion).toBeDefined();
        console.log(`aztfexport version: ${result.aztfexportVersion}`);
        
        if (result.terraformVersion) {
          console.log(`terraform version: ${result.terraformVersion}`);
        }
      } else {
        expect(result.installationHelp).toBeDefined();
      }
    });

    it('should provide installation help if not installed', async () => {
      const result = await checkAztfexportInstallation({});

      if (!result.installed) {
        expect(result.installationHelp).toBeDefined();
        expect(typeof result.installationHelp).toBe('object');
      }
    });
  });
});
