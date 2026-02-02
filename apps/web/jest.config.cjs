module.exports = {
  preset: '@repo/jest-presets/node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/__integrationTests__/'],
};
