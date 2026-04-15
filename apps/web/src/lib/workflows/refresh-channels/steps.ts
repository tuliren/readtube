import { prisma } from '@readtube/database';

import { isEmptyString } from '@/lib/string';
import { fetchChannelLatest } from '@/lib/youtube/channelMetadata';
import { scrapeChannel } from '@/lib/youtube/scrapeChannel';

/** Number of days before a channel is considered stale and eligible for refresh. */
export const STALE_DAYS = 5;

/** Maximum number of channels to refresh per workflow run. */
export const BATCH_SIZE = 10;

/** Delay in ms between API calls to stay well under the 300 req/min rate limit. */
const RATE_LIMIT_DELAY_MS = 250;

/**
 * Videos at or under this duration are treated as YouTube Shorts and
 * skipped during ingest. YouTube's own definition of a Short is ≤60s.
 */
const SHORTS_MAX_DURATION_SECONDS = 60;

export interface StaleChannel {
  id: string;
  source_id: string;
  name: string;
}

export async function fetchStaleChannels(): Promise<StaleChannel[]> {
  'use step';

  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  return prisma.channel.findMany({
    where: {
      OR: [{ checked_at: null }, { checked_at: { lt: cutoff } }],
    },
    orderBy: { checked_at: { sort: 'asc', nulls: 'first' } },
    take: BATCH_SIZE,
    select: { id: true, source_id: true, name: true },
  });
}

export async function fetchChannelById(channelId: string): Promise<StaleChannel | null> {
  'use step';

  return prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, source_id: true, name: true },
  });
}

export interface RefreshResult {
  channelId: string;
  videosProcessed: number;
  nameUpdated: boolean;
}

export async function refreshChannel(channel: StaleChannel): Promise<RefreshResult> {
  'use step';

  await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));

  const data = await fetchChannelLatest(channel.source_id);

  const videoSourceIds = data.videos.map((v) => v.videoId);
  const existingVideos = await prisma.video.findMany({
    where: { channel_id: channel.id, source_id: { in: videoSourceIds } },
    select: { source_id: true, duration_seconds: true },
  });
  const existingSourceIds = new Set(existingVideos.map((v) => v.source_id));

  // Best-effort scrape for logo_url, handle, and duration_seconds —
  // fields the TranscriptAPI RSS endpoint doesn't provide. Always
  // scrape to keep logo_url / handle fresh and to detect Shorts (which
  // are excluded from the regular `videoRenderer` shelf).
  let logoUrl: string | null = null;
  let handle: string | null = null;
  let scrapeSucceeded = false;
  const durationMap = new Map<string, number>();
  const scrapedVideoIds = new Set<string>();
  try {
    const channelPageUrl = `https://www.youtube.com/channel/${channel.source_id}`;
    const scraped = await scrapeChannel(channelPageUrl);
    scrapeSucceeded = true;
    logoUrl = scraped.logoUrl;
    handle = scraped.handle;
    for (const v of scraped.videos) {
      scrapedVideoIds.add(v.videoId);
      if (v.durationSeconds != null) {
        durationMap.set(v.videoId, v.durationSeconds);
      }
    }
  } catch (err) {
    console.warn(
      `[refresh-channels] scrape failed for ${channel.id}, skipping logo/duration:`,
      err
    );
  }

  const nameUpdated = data.channel.title !== channel.name;

  let videosProcessed = 0;
  for (const video of data.videos) {
    const durationSeconds = durationMap.get(video.videoId) ?? null;
    const isExisting = existingSourceIds.has(video.videoId);

    if (!isExisting && isShort({ durationSeconds, scrapeSucceeded, scrapedVideoIds, video })) {
      console.log(
        `[refresh-channels] skipping Short ${video.videoId} (duration=${durationSeconds ?? 'unknown'}) for channel ${channel.id}`
      );
      continue;
    }

    videosProcessed++;
    await prisma.video.upsert({
      where: {
        video_unique_channel_source: {
          channel_id: channel.id,
          source_id: video.videoId,
        },
      },
      create: {
        channel_id: channel.id,
        source_id: video.videoId,
        title: video.title,
        description: video.description,
        published_at: video.publishedAt,
        thumbnail_url: video.thumbnailUrl,
        duration_seconds: durationSeconds,
      },
      update: {
        title: video.title,
        ...(isEmptyString(video.description) ? {} : { description: video.description }),
        ...(video.thumbnailUrl != null ? { thumbnail_url: video.thumbnailUrl } : {}),
        ...(durationSeconds != null ? { duration_seconds: durationSeconds } : {}),
      },
    });
  }

  await prisma.channel.update({
    where: { id: channel.id },
    data: {
      ...(nameUpdated ? { name: data.channel.title } : {}),
      ...(!isEmptyString(logoUrl) ? { logo_url: logoUrl } : {}),
      ...(!isEmptyString(handle) ? { handle } : {}),
      checked_at: new Date(),
    },
  });

  return {
    channelId: channel.id,
    videosProcessed,
    nameUpdated,
  };
}

/**
 * A video is treated as a Short if either:
 *   1. We know its duration from the channel page scrape and it's ≤60s, or
 *   2. The scrape succeeded but the video wasn't in the regular videos
 *      shelf — Shorts live in a separate shelf with no `lengthText`,
 *      so their absence is the strongest signal we have when duration
 *      is unknown.
 *
 * If the scrape failed entirely, we err on the side of storing the
 * video — better to ingest a Short than to silently drop a real one.
 */
function isShort(args: {
  durationSeconds: number | null;
  scrapeSucceeded: boolean;
  scrapedVideoIds: Set<string>;
  video: { videoId: string };
}): boolean {
  const { durationSeconds, scrapeSucceeded, scrapedVideoIds, video } = args;
  if (durationSeconds != null) {
    return durationSeconds <= SHORTS_MAX_DURATION_SECONDS;
  }
  return scrapeSucceeded && !scrapedVideoIds.has(video.videoId);
}
