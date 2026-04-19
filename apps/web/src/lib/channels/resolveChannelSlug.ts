import type { PrismaClient } from '@readtube/database';

/**
 * Resolve a `/channels/[slug]` path segment to a Channel row. The slug
 * is either a handle (leading `@`, e.g. `@mkbhd` — YouTube only,
 * Bilibili has no handle convention) or a platform `source_id` —
 * YouTube UC-prefixed id, or a Bilibili numeric mid.
 *
 * Platform-agnostic: both `source_id` and `handle` are column-level
 * unique constraints scoped by `(source_type, ...)`, but in practice
 * the shapes don't collide (UC ids start with "UC", Bilibili mids
 * are all-digit, handles are YouTube-only), so `findFirst` on the
 * slug column is safe without a `source_type` scope. Handles in the
 * DB are stored inconsistently — some rows include the leading `@`,
 * some don't — so match both forms when the slug looks like a handle.
 */
export async function resolveChannelSlug(prisma: PrismaClient, slug: string) {
  const decoded = decodeURIComponent(slug);
  if (decoded.startsWith('@')) {
    const bare = decoded.slice(1);
    return prisma.channel.findFirst({
      where: { handle: { in: [`@${bare}`, bare] } },
    });
  }
  return prisma.channel.findFirst({
    where: { source_id: decoded },
  });
}
