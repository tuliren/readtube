import { prisma } from '@repo/database';

export { prisma };

/**
 * Asserts that a database query for a resource includes the expected userId,
 * preventing cross-tenant data access. Use when querying by ID directly.
 */
export async function assertOwnership(
  channelQuery: Promise<{ userId: string } | null>,
  userId: string
): Promise<boolean> {
  const record = await channelQuery;
  return record?.userId === userId;
}

/**
 * Helper to scope channel queries to a specific user. Returns a where clause
 * that filters by userId for use in Prisma queries.
 */
export function channelScope(userId: string) {
  return { userId };
}
