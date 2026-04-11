import { PrismaClient } from '@readtube/database';

/**
 * Import '@tests/integration-tests' in integration test files,
 * and use global.testPrisma to access the test database.
 */
declare global {
  var testPrisma: PrismaClient;
}
