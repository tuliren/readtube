import { type PrismaClient, VideoPlatformType } from '@readtube/database';

import { detectChannelSource } from '@/lib/platforms';

/**
 * Resolve a `/channels/[slug]` path segment to a Channel row. The slug
 * is either a handle (leading `@`, e.g. `@mkbhd` — YouTube only,
 * Bilibili has no handle convention) or a platform `source_id` —
 * YouTube UC-prefixed id, or a Bilibili numeric mid.
 *
 * Handles: scoped to YouTube via `source_type: YOUTUBE` because the
 * Channel unique constraint is `(source_type, handle)` and Bilibili
 * rows always store `handle = NULL`. Both `@mkbhd` and `mkbhd` are
 * matched because the DB stores handles inconsistently.
 *
 * Source ids: use `detectChannelSource` to infer the platform from
 * the slug's shape (UC-prefixed → YouTube, numeric → Bilibili) and
 * scope the lookup to that platform via the (source_type, source_id)
 * unique index. That's the deterministic path — the underlying
 * composite unique makes `findUnique` exact.
 *
 * When the shape doesn't match any platform (e.g. short/synthetic
 * test slugs, unknown platform id), fall back to `findFirst` ordered
 * by `created_at ASC` so collisions pick the same row every time.
 */
export async function resolveChannelSlug(prisma: PrismaClient, slug: string) {
  const decoded = decodeURIComponent(slug);

  if (decoded.startsWith('@')) {
    const bare = decoded.slice(1);
    return prisma.channel.findFirst({
      where: {
        source_type: VideoPlatformType.YOUTUBE,
        handle: { in: [`@${bare}`, bare] },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  // Shape-directed fast path — UC id or numeric mid locks the lookup
  // to the right platform even if a cross-platform source_id
  // collision exists in the DB.
  const match = detectChannelSource(decoded);
  if (match != null) {
    return prisma.channel.findUnique({
      where: {
        channel_unique_source: {
          source_type: match.platform.type,
          source_id: decoded,
        },
      },
    });
  }

  // Unknown shape — fall back to an ordered findFirst so we still
  // return a deterministic row if one exists.
  return prisma.channel.findFirst({
    where: { source_id: decoded },
    orderBy: { created_at: 'asc' },
  });
}
