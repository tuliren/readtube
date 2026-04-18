import type { PrismaClient, VideoPlatformType } from '@readtube/database';

/**
 * Resolve a `/videos/[videoId]` path segment to a Video row. `videoId`
 * is the platform `source_id` (e.g. the 11-char YouTube video id).
 * Scoped to `sourceType` (default `YOUTUBE`) because `source_id` is
 * only unique per platform.
 */
export async function resolveVideoSourceId(
  prisma: PrismaClient,
  videoId: string,
  sourceType: VideoPlatformType = 'YOUTUBE'
) {
  return prisma.video.findUnique({
    where: { video_unique_source: { source_type: sourceType, source_id: videoId } },
  });
}
