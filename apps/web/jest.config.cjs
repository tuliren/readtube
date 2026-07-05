module.exports = {
  preset: '@readtube/jest-presets/node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
    // ESM-only package Jest can't parse; the emitter no-ops in tests.
    '^@vercel/analytics/server$': '<rootDir>/tests/mocks/vercelAnalyticsServer.ts',
  },
  testPathIgnorePatterns: ['/node_modules/', '/__integrationTests__/'],
};
