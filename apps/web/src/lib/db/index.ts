import { prisma } from '@readtube/database';

export { prisma };

/**
 * Asserts that a database query for a resource includes the expected user_id,
 * preventing cross-tenant data access. Use when querying by ID directly.
 */
export async function assertOwnership(
  channelQuery: Promise<{ user_id: string } | null>,
  userId: string
): Promise<boolean> {
  const record = await channelQuery;
  return record?.user_id === userId;
}

/**
 * Helper to scope channel queries to a specific user. Returns a where clause
 * that filters by user_id for use in Prisma queries.
 */
export function channelScope(userId: string) {
  return { user_id: userId };
}
