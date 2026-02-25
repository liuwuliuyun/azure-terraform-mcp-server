/**
 * Tests for tools/policy-manager.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import {
  getPolicyPath,
  verifyPolicyDirectory,
  getPolicyStatus,
} from '../src/tools/policy-manager.js';
import { createTempDir, cleanupTempDir, createSubDir, createFile } from './helpers.js';

// ==========================================
// getPolicyPath
// ==========================================

describe('getPolicyPath', () => {
  it('should append "policy" to workspace path', () => {
    const result = getPolicyPath('/workspace');
    expect(result).toBe(join('/workspace', 'policy'));
  });

  it('should handle Windows paths', () => {
    const result = getPolicyPath('C:\\Users\\test\\workspace');
    expect(result).toContain('policy');
  });

  it('should handle trailing separator', () => {
    const result = getPolicyPath('/workspace/');
    expect(result).toContain('policy');
  });
});

// ==========================================
// verifyPolicyDirectory
// ==========================================

describe('verifyPolicyDirectory', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should return invalid for non-existent directory', () => {
    const result = verifyPolicyDirectory('/nonexistent/path');
    expect(result.valid).toBe(false);
    expect(result.availableSets).toEqual([]);
    expect(result.missingExpected.length).toBeGreaterThan(0);
    expect(result.totalFiles).toBe(0);
  });

  it('should return invalid for empty directory (missing policy sets)', () => {
    const policyDir = createSubDir(tempDir, 'policy');
    const result = verifyPolicyDirectory(policyDir);
    expect(result.valid).toBe(false);
    expect(result.missingExpected).toContain('avmsec');
    expect(result.missingExpected).toContain('Azure-Proactive-Resiliency-Library-v2');
  });

  it('should return valid when all expected policy sets exist', () => {
    const policyDir = createSubDir(tempDir, 'policy');
    const avmsecDir = createSubDir(policyDir, 'avmsec');
    const aprlDir = createSubDir(policyDir, 'Azure-Proactive-Resiliency-Library-v2');

    // Add some files
    createFile(avmsecDir, 'policy.rego', 'package avmsec');
    createFile(aprlDir, 'policy.rego', 'package aprl');

    const result = verifyPolicyDirectory(policyDir);
    expect(result.valid).toBe(true);
    expect(result.availableSets).toContain('avmsec');
    expect(result.availableSets).toContain('Azure-Proactive-Resiliency-Library-v2');
    expect(result.missingExpected).toEqual([]);
    expect(result.totalFiles).toBeGreaterThan(0);
  });

  it('should report partial policy sets', () => {
    const policyDir = createSubDir(tempDir, 'policy');
    createSubDir(policyDir, 'avmsec');
    // Missing Azure-Proactive-Resiliency-Library-v2

    const result = verifyPolicyDirectory(policyDir);
    expect(result.valid).toBe(false);
    expect(result.availableSets).toContain('avmsec');
    expect(result.missingExpected).toContain('Azure-Proactive-Resiliency-Library-v2');
  });

  it('should count files recursively', () => {
    const policyDir = createSubDir(tempDir, 'policy');
    const avmsecDir = createSubDir(policyDir, 'avmsec');
    const aprlDir = createSubDir(policyDir, 'Azure-Proactive-Resiliency-Library-v2');
    const subDir = createSubDir(avmsecDir, 'sub');

    createFile(avmsecDir, 'policy1.rego', 'package avmsec');
    createFile(subDir, 'policy2.rego', 'package avmsec.sub');
    createFile(aprlDir, 'policy3.rego', 'package aprl');

    const result = verifyPolicyDirectory(policyDir);
    expect(result.totalFiles).toBe(3);
  });

  it('should include path in result', () => {
    const policyDir = createSubDir(tempDir, 'policy');
    const result = verifyPolicyDirectory(policyDir);
    expect(result.path).toBe(policyDir);
  });
});

// ==========================================
// getPolicyStatus
// ==========================================

describe('getPolicyStatus', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should return not available when policy dir does not exist', () => {
    const result = getPolicyStatus(tempDir);
    expect(result.available).toBe(false);
    expect(result.policySets).toEqual([]);
  });

  it('should return status when policy dir exists with all sets', () => {
    const policyDir = createSubDir(tempDir, 'policy');
    const avmsecDir = createSubDir(policyDir, 'avmsec');
    const aprlDir = createSubDir(policyDir, 'Azure-Proactive-Resiliency-Library-v2');
    createFile(avmsecDir, 'policy.rego', 'package avmsec');
    createFile(aprlDir, 'policy.rego', 'package aprl');

    const result = getPolicyStatus(tempDir);
    expect(result.available).toBe(true);
    expect(result.path).toBe(policyDir);
    expect(result.policySets).toContain('avmsec');
    expect(result.policySets).toContain('Azure-Proactive-Resiliency-Library-v2');
    expect(result.gitRemote).toContain('github.com');
  });

  it('should return not available when policy dir is incomplete', () => {
    const policyDir = createSubDir(tempDir, 'policy');
    // Only one policy set
    createSubDir(policyDir, 'avmsec');

    const result = getPolicyStatus(tempDir);
    expect(result.available).toBe(false);
  });
});
