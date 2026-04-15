import type { PrismaClient, VideoPlatformType } from '@readtube/database';

/**
 * Resolve a `/channels/[slug]` path segment to a Channel row. The slug
 * is either a handle (leading `@`, e.g. `@mkbhd`) or a platform
 * `source_id` (e.g. `UCxxx`). Handles in the DB are stored
 * inconsistently — some rows include the leading `@`, some don't — so
 * match both forms when the slug looks like a handle.
 *
 * Scoped to a `sourceType` because `source_id` and `handle` are only
 * unique per platform. Defaults to `YOUTUBE`, the only platform today.
 */
export async function resolveChannelSlug(
  prisma: PrismaClient,
  slug: string,
  sourceType: VideoPlatformType = 'YOUTUBE'
) {
  const decoded = decodeURIComponent(slug);
  if (decoded.startsWith('@')) {
    const bare = decoded.slice(1);
    return prisma.channel.findFirst({
      where: { source_type: sourceType, handle: { in: [`@${bare}`, bare] } },
    });
  }
  return prisma.channel.findUnique({
    where: { channel_unique_source: { source_type: sourceType, source_id: decoded } },
  });
}
