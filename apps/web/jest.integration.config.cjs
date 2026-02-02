module.exports = {
  preset: '@repo/jest-presets/node',
  setupFilesAfterEnv: ['<rootDir>/jest.integration.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },
  testMatch: ['<rootDir>/**/__integrationTests__/*.test.ts'],
  testTimeout: 60000,
};
