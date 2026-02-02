import { PrismaClient } from '@repo/database';

/**
 * Import '@tests/integration-tests' in integration test files,
 * and use global.testPrisma to access the test database.
 */
declare global {
  var testPrisma: PrismaClient;
}
