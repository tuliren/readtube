import { type Prisma, VideoPlatformType } from '@readtube/database';

import type { FetchSource } from '@/lib/platforms/types';
import { UNKNOWN_CHANNEL_NAME } from '@/lib/platforms/youtube/constants';
import { buildRssUrl } from '@/lib/platforms/youtube/urls';
import { isEmptyString } from '@/lib/string';

/** Normalised shape for a video from either RSS or page scrape. */
interface PlaylistVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  /** The uploader's actual channel — not the playlist owner's. Falls
   *  back to feed-level channel when the source didn't expose per-video
   *  info. */
  channelId: string | null;
  channelName: string | null;
}

/** Normalised shape for playlist metadata from either source. */
export interface PlaylistFeed {
  channelId: string;
  channelName: string;
  name: string;
  videos: PlaylistVideo[];
  /** Which tier served this fetch — persisted to Playlist.fetched_via. */
  fetchedVia: FetchSource;
}

/** Upsert source metadata and append missing entries without changing existing membership order. */
export async function persistPlaylistVideos(
  prisma: Prisma.TransactionClient,
  playlistId: string,
  feed: PlaylistFeed,
  startOrder = 0
): Promise<number> {
  let videosProcessed = 0;

  for (let i = 0; i < feed.videos.length; i++) {
    const v = feed.videos[i];

    // Use the video's actual uploader channel (from per-entry byline)
    // rather than the playlist owner. Falls back to the feed-level
    // channel when the source didn't expose per-video info.
    const channelId = v.channelId || feed.channelId || 'UC_unknown';
    const channelName = v.channelName || feed.channelName || UNKNOWN_CHANNEL_NAME;
    const channel = await prisma.channel.upsert({
      where: {
        channel_unique_source: {
          source_type: VideoPlatformType.YOUTUBE,
          source_id: channelId,
        },
      },
      create: {
        source_type: VideoPlatformType.YOUTUBE,
        source_id: channelId,
        name: channelName,
        rss_url: buildRssUrl(channelId),
      },
      update: {},
      select: { id: true },
    });

    const video = await prisma.video.upsert({
      where: {
        video_unique_source: {
          source_type: VideoPlatformType.YOUTUBE,
          source_id: v.videoId,
        },
      },
      create: {
        channel_id: channel.id,
        // source_type must match the `where` clause so Prisma uses a
        // native Postgres upsert (CLAUDE.md).
        source_type: VideoPlatformType.YOUTUBE,
        source_id: v.videoId,
        title: v.title,
        description: v.description,
        // published_at is nullable — scrape paths can legitimately
        // return null. A later source (fetchVideoSnapshot on open,
        // refresh cron) will backfill via the update branch.
        published_at: v.publishedAt,
        thumbnail_url: v.thumbnailUrl,
        duration_seconds: v.durationSeconds,
      },
      update: {
        title: v.title,
        ...(isEmptyString(v.description) ? {} : { description: v.description }),
        // Backfill published_at whenever this source produced a real
        // date — skips the field otherwise so existing values (null
        // or real) are preserved.
        ...(v.publishedAt != null ? { published_at: v.publishedAt } : {}),
        ...(v.thumbnailUrl != null ? { thumbnail_url: v.thumbnailUrl } : {}),
        ...(v.durationSeconds != null ? { duration_seconds: v.durationSeconds } : {}),
      },
      select: { id: true },
    });

    await prisma.playlistVideo.upsert({
      where: {
        playlist_video_unique_playlist_video: { playlist_id: playlistId, video_id: video.id },
      },
      create: { playlist_id: playlistId, video_id: video.id, sort_order: startOrder + i },
      update: {},
    });

    videosProcessed++;
  }

  return videosProcessed;
}
