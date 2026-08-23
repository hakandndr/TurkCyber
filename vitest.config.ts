import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
    /**
     * Builds the site into `.test-dist/` before any test file is collected.
     * The run owns that output: it is deleted and rebuilt every time, so
     * neither a missing nor a stale `dist/` can affect a single assertion.
     */
    globalSetup: ['tests/global-setup.ts'],
    // The setup build needs more than the default 10s on a cold cache.
    hookTimeout: 180000,
    teardownTimeout: 30000,
  },
});
