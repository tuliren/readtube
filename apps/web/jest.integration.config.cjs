module.exports = {
  preset: '@readtube/jest-presets/node',
  setupFilesAfterEnv: ['<rootDir>/jest.integration.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
    // ESM-only package Jest can't parse; the emitter no-ops in tests.
    '^@vercel/analytics/server$': '<rootDir>/tests/mocks/vercelAnalyticsServer.ts',
    // ESM-only since v5; strategy modules import it for `FatalError`.
    '^workflow$': '<rootDir>/tests/mocks/workflow.ts',
    // ESM-only since v7; strategy modules import it for `streamText`.
    '^ai$': '<rootDir>/tests/mocks/ai.ts',
  },
  testMatch: ['<rootDir>/**/__integrationTests__/*.test.ts'],
  testTimeout: 60000,
  // When INTEGRATION_DATABASE_URL is set, all test files share one Postgres
  // instance (the GitHub Actions service container), so jest must run files
  // serially to avoid cross-file data races. Locally each file spins up its
  // own testcontainer via jest.integration.setup.ts, so parallelism is safe.
  maxWorkers: process.env.INTEGRATION_DATABASE_URL != null ? 1 : '50%',
};
