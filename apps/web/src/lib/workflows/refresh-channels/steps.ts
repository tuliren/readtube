import { type VideoPlatformType, prisma } from '@readtube/database';

import { hasChannelHandleConflict } from '@/lib/channels/handleConflict';
import { STALE_DAYS } from '@/lib/channels/staleness';
import { getPlatformByType } from '@/lib/platforms';
import { isEmptyString } from '@/lib/string';

export { STALE_DAYS };

/** Maximum number of channels to refresh per workflow run. */
export const BATCH_SIZE = 10;

/**
 * Small delay between per-channel fetches so we stay polite toward
 * upstream endpoints (YouTube RSS, Bilibili space page + view API) and
 * don't burst a large batch of requests in parallel.
 */
const RATE_LIMIT_DELAY_MS = 250;

export interface StaleChannel {
  id: string;
  source_id: string;
  source_type: VideoPlatformType;
  name: string;
}

export async function fetchStaleChannels(): Promise<StaleChannel[]> {
  'use step';

  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  // Only refresh channels with at least one active UserSubscription.
  // "Shadow" channel rows created by the individual-video add flow exist
  // so that a standalone video always has a valid Channel FK, but until
  // a user actually subscribes to them we don't need to refresh them.
  // They get picked up lazily on first subscribe.
  //
  // Platform-specific fetching is dispatched via getPlatformByType using
  // source_type.
  //
  // Skip Bilibili channels when JUSTONEAPI_TOKEN is unset — their
  // fetchChannelSnapshot would throw on every cron run, and because
  // refreshChannel only updates checked_at on success, null-checked_at
  // Bilibili rows would otherwise sit at the front of the `ORDER BY
  // checked_at NULLS FIRST` queue forever and starve YouTube refreshes.
  const excludedPlatforms: VideoPlatformType[] = [];
  if (process.env.JUSTONEAPI_TOKEN == null || process.env.JUSTONEAPI_TOKEN.length === 0) {
    excludedPlatforms.push('BILIBILI' as VideoPlatformType);
  }

  const rows = await prisma.channel.findMany({
    where: {
      OR: [{ checked_at: null }, { checked_at: { lt: cutoff } }],
      subscriptions: { some: {} },
      ...(excludedPlatforms.length > 0 ? { source_type: { notIn: excludedPlatforms } } : {}),
    },
    orderBy: { checked_at: { sort: 'asc', nulls: 'first' } },
    take: BATCH_SIZE,
    select: { id: true, source_id: true, source_type: true, name: true },
  });
  return rows;
}

export async function fetchChannelById(channelId: string): Promise<StaleChannel | null> {
  'use step';

  const row = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, source_id: true, source_type: true, name: true },
  });
  return row;
}

export interface RefreshResult {
  channelId: string;
  videosProcessed: number;
  nameUpdated: boolean;
}

export async function refreshChannel(channel: StaleChannel): Promise<RefreshResult> {
  'use step';

  await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));

  const platform = getPlatformByType(channel.source_type);
  const snapshot = await platform.fetchChannelSnapshot(channel.source_id);

  const nameUpdated = snapshot.name !== channel.name;

  for (const video of snapshot.videos) {
    // Use `video_unique_source` (source_type + source_id, globally
    // unique) instead of `video_unique_channel_source`. This avoids a
    // P2002 crash when a video was previously created under a
    // different channel (e.g. the playlist-owner's channel from the
    // add-playlist flow) — the cron now matches the existing row and
    // corrects the channel_id to the actual owner.
    await prisma.video.upsert({
      where: {
        video_unique_source: {
          source_type: channel.source_type,
          source_id: video.videoId,
        },
      },
      create: {
        channel_id: channel.id,
        // source_type must match the `where` clause so Prisma uses a
        // native Postgres upsert (CLAUDE.md).
        source_type: channel.source_type,
        source_id: video.videoId,
        title: video.title,
        description: video.description,
        published_at: video.publishedAt,
        thumbnail_url: video.thumbnailUrl,
        duration_seconds: video.durationSeconds,
      },
      update: {
        // Correct channel_id if the video was previously assigned to
        // a different channel (e.g. playlist-owner shadow channel).
        channel_id: channel.id,
        title: video.title,
        ...(isEmptyString(video.description) ? {} : { description: video.description }),
        // Backfill published_at whenever this refresh produced a real
        // date — rows that were created with a null placeholder from
        // a thin scrape path get the real RSS timestamp here.
        ...(video.publishedAt != null ? { published_at: video.publishedAt } : {}),
        thumbnail_url: video.thumbnailUrl,
        ...(video.durationSeconds != null ? { duration_seconds: video.durationSeconds } : {}),
      },
    });
  }

  // Skip the handle update when another channel row already owns it
  // (stale scrape or a rename upstream) — otherwise the update would
  // trip `@@unique([source_type, handle])` and crash the cron.
  const handleConflict = await hasChannelHandleConflict(
    prisma,
    snapshot.handle,
    channel.id,
    channel.source_type
  );
  await prisma.channel.update({
    where: { id: channel.id },
    data: {
      ...(nameUpdated ? { name: snapshot.name } : {}),
      ...(!isEmptyString(snapshot.logoUrl) ? { logo_url: snapshot.logoUrl } : {}),
      ...(!isEmptyString(snapshot.handle) && !handleConflict ? { handle: snapshot.handle } : {}),
      checked_at: new Date(),
    },
  });

  return {
    channelId: channel.id,
    videosProcessed: snapshot.videos.length,
    nameUpdated,
  };
}
