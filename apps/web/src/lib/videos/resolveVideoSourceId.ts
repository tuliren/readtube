import type { PrismaClient, VideoPlatformType } from '@readtube/database';

import { detectPlatformTypeFromSourceId } from '@/lib/platforms';

/**
 * Resolve a `/videos/[videoId]` path segment to a Video row. `videoId`
 * is the platform `source_id` (11-char YouTube id, or a BV-prefixed
 * Bilibili id). Since `source_id` is only unique per platform, we
 * infer the platform from the id's shape — YouTube and Bilibili
 * sourceId patterns don't overlap.
 *
 * Callers can pass an explicit `sourceType` to skip the detection
 * (useful in tests); omitting it infers from the id shape and returns
 * null if the shape doesn't match any known platform.
 */
export async function resolveVideoSourceId(
  prisma: PrismaClient,
  videoId: string,
  sourceType?: VideoPlatformType
) {
  const resolvedType = sourceType ?? detectPlatformTypeFromSourceId(videoId);
  if (resolvedType == null) {
    return null;
  }
  return prisma.video.findUnique({
    where: { video_unique_source: { source_type: resolvedType, source_id: videoId } },
  });
}
