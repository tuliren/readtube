import { type PrismaClient, VideoPlatformType } from '@readtube/database';

import { isEmptyString } from '@/lib/string';
import type { ChannelSnapshot } from '@/lib/youtube/channelSnapshot';
import { buildRssUrl } from '@/lib/youtube/urls';

export interface UpsertChannelResult {
  id: string;
  source_id: string;
  name: string;
  handle: string | null;
  rss_url: string;
  logo_url: string | null;
  created_at: Date;
  updated_at: Date;
  checked_at: Date | null;
}

/**
 * Upsert a Channel + its initial video list from a fresh snapshot.
 *
 * The per-row `handle` column has a `@@unique([source_type, handle])`
 * constraint, and older channel rows can end up holding a stale handle
 * (e.g. an early scrape captured the handle, the owner later renamed,
 * and now a different UC id resolves to the same handle string). To
 * avoid tripping the constraint, we check whether another row already
 * owns the scraped handle; if so, we skip the handle update on the
 * current row and let the refresh cron reconcile later. The correct
 * pointer lives on the canonical row identified by `source_id`.
 */
export async function upsertChannelWithVideos(
  prisma: PrismaClient,
  sourceId: string,
  snapshot: ChannelSnapshot
): Promise<UpsertChannelResult> {
  const conflictingHandle =
    !isEmptyString(snapshot.handle) &&
    (await prisma.channel.findFirst({
      where: {
        source_type: VideoPlatformType.YOUTUBE,
        handle: snapshot.handle,
        NOT: { source_id: sourceId },
      },
      select: { id: true },
    })) != null;

  return prisma.channel.upsert({
    where: {
      channel_unique_source: { source_type: VideoPlatformType.YOUTUBE, source_id: sourceId },
    },
    create: {
      source_type: VideoPlatformType.YOUTUBE,
      source_id: sourceId,
      name: snapshot.name,
      rss_url: buildRssUrl(sourceId),
      logo_url: snapshot.logoUrl,
      ...(conflictingHandle ? {} : { handle: snapshot.handle }),
      videos: {
        create: snapshot.videos.map((v) => ({
          source_id: v.videoId,
          title: v.title,
          description: v.description,
          published_at: v.publishedAt,
          thumbnail_url: v.thumbnailUrl,
          duration_seconds: v.durationSeconds,
        })),
      },
    },
    update: {
      ...(snapshot.logoUrl != null ? { logo_url: snapshot.logoUrl } : {}),
      ...(conflictingHandle || isEmptyString(snapshot.handle) ? {} : { handle: snapshot.handle }),
    },
  });
}
