import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'tests/integration/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/cli.ts'],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    // Isolate tests to prevent env var pollution
    isolate: true,
    // Run tests sequentially for config tests that modify env
    sequence: {
      shuffle: false,
    },
  },
});
