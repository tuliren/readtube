module.exports = {
  preset: '@readtube/jest-presets/node',
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }] },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
    // ESM-only package Jest can't parse; the emitter no-ops in tests.
    '^@vercel/analytics/server$': '<rootDir>/tests/mocks/vercelAnalyticsServer.ts',
    // `pangu/shared` (the browser-safe entry the app imports) is
    // ESM-only; the package's CJS node build exposes the same `pangu`.
    '^pangu/shared$': require.resolve('pangu'),
  },
  testPathIgnorePatterns: ['/node_modules/', '/__integrationTests__/'],
};
