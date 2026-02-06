import { defineConfig } from 'vitest/config';

/**
 * Integration test configuration.
 * These tests call real external services (GitHub, Azure, Terraform Registry).
 * 
 * Run with: npm run test:integration
 * 
 * Environment variables:
 * - GITHUB_TOKEN: GitHub personal access token (recommended to avoid rate limits)
 * - ARM_SUBSCRIPTION_ID: Azure subscription ID (required for aztfexport tests)
 * - ARM_TENANT_ID: Azure tenant ID (required for aztfexport tests)
 * - ARM_CLIENT_ID: Azure client/application ID (required for aztfexport tests)
 * - ARM_CLIENT_SECRET: Azure client secret (required for aztfexport tests)
 * - SKIP_AZTFEXPORT_TESTS: Set to 'true' to skip aztfexport tests
 * - SKIP_CONFTEST_TESTS: Set to 'true' to skip conftest tests
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    // Longer timeouts for real network/Azure operations
    testTimeout: 120000, // 2 minutes per test
    hookTimeout: 60000,  // 1 minute for setup/teardown
    // Run tests sequentially to avoid rate limiting
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Retry on flaky network issues
    retry: 1,
  },
});
