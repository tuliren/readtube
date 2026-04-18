import type { ChannelSnapshot, SnapshotVideo } from '@/lib/platforms/types';
import { type RssChannel, fetchRssFeed, isYouTubeShort } from '@/lib/youtube/channelRss';
import { type ScrapedChannel, scrapeChannel } from '@/lib/youtube/channelScrape';
import { fetchChannelLatest } from '@/lib/youtube/transcriptApi';
import { buildRssUrl, buildThumbnailUrl } from '@/lib/youtube/urls';

// Re-exported so existing `@/lib/youtube/channelSnapshot` imports keep
// working after ChannelSnapshot moved to `@/lib/platforms/types`.
export type { ChannelSnapshot, SnapshotVideo };

/** Duration threshold (seconds) for filtering Shorts when RSS is unavailable. */
const SHORTS_DURATION_THRESHOLD = 60;

/**
 * Single entry point for both "subscribe to a new channel" and
 * "refresh an existing channel". RSS is the source of truth for the
 * video list (full descriptions, real publish times, canonical
 * `/shorts/<id>` vs `/watch?v=<id>` links). Scrape contributes only
 * the fields RSS doesn't expose: per-video duration, channel logo,
 * and channel handle.
 *
 * When both URLs are known up-front (refresh path, or initial
 * subscription via a `/channel/UCxxx` URL), we fire both requests in
 * parallel. When only the page URL is known (initial subscription
 * via `@handle`), we scrape first to resolve the channel id, then
 * fetch RSS.
 *
 * Fallback chain for the video list:
 * 1. YouTube RSS — full descriptions, real publish times, canonical
 *    `/shorts/` vs `/watch?v=` links for Shorts filtering.
 * 2. TranscriptAPI `/channel/latest` — same data shape as RSS
 *    (including `/shorts/` links). Used when RSS returns 404.
 * 3. Scrape-only — truncated descriptions, approximate publish times,
 *    Shorts filtered by duration (≤60s) instead of link pattern.
 *
 * Scrape failure is always tolerated — we return the snapshot with
 * `handle: null`, `logoUrl: null`, and every video's
 * `durationSeconds: null`. Only when all three video-list sources
 * fail *and* scrape also failed do we throw.
 */
export async function fetchChannelSnapshot(args: {
  channelPageUrl: string;
  rssUrl?: string;
}): Promise<ChannelSnapshot> {
  console.info(`Fetching channel snapshot for ${args.channelPageUrl}`);

  let scraped: ScrapedChannel | null = null;
  let feed: RssChannel | null = null;

  if (args.rssUrl != null) {
    const [scrapeResult, rssResult] = await Promise.allSettled([
      scrapeChannel(args.channelPageUrl),
      fetchRssFeed(args.rssUrl),
    ]);

    if (scrapeResult.status === 'fulfilled') {
      scraped = scrapeResult.value;
    } else {
      console.warn('[channelSnapshot] scrape failed:', scrapeResult.reason);
    }

    if (rssResult.status === 'fulfilled') {
      feed = rssResult.value;
    } else {
      console.warn('[channelSnapshot] RSS failed:', rssResult.reason);
      feed = await tryTranscriptApiFallback(scraped, args.channelPageUrl);
    }
  } else {
    // Handle-based input — can't build RSS URL until we know the UC id.
    scraped = await scrapeChannel(args.channelPageUrl);
    try {
      feed = await fetchRssFeed(buildRssUrl(scraped.channelId));
    } catch (err) {
      console.warn('[channelSnapshot] RSS failed:', err);
      feed = await tryTranscriptApiFallback(scraped, args.channelPageUrl);
    }
  }

  if (feed != null) {
    return mergeSnapshot(feed, scraped);
  }

  // RSS and TranscriptAPI both unavailable — build from scrape data.
  if (scraped == null) {
    throw new Error('RSS, TranscriptAPI, and scrape all failed — cannot fetch channel data');
  }
  return buildSnapshotFromScrape(scraped);
}

/**
 * Try TranscriptAPI as a fallback when RSS fails. Returns null if the
 * fallback also fails, so the caller can continue to the next tier.
 */
async function tryTranscriptApiFallback(
  scraped: ScrapedChannel | null,
  channelPageUrl: string
): Promise<RssChannel | null> {
  const channelInput = scraped?.handle ?? scraped?.channelId ?? channelPageUrl;
  try {
    const feed = await fetchChannelLatestAsRss(channelInput);
    console.info('[channelSnapshot] TranscriptAPI fallback succeeded');
    return feed;
  } catch (err) {
    console.warn('[channelSnapshot] TranscriptAPI fallback failed:', err);
    return null;
  }
}

/**
 * Fetch videos via TranscriptAPI and return them in the same shape as
 * the YouTube RSS feed so `mergeSnapshot` can consume them unchanged.
 */
async function fetchChannelLatestAsRss(channelInput: string): Promise<RssChannel> {
  const result = await fetchChannelLatest(channelInput);
  return {
    channelId: result.channel.channelId,
    name: result.channel.title,
    authorName: result.channel.title,
    videos: result.videos.map((v) => ({
      videoId: v.videoId,
      title: v.title,
      description: v.description,
      publishedAt: v.publishedAt,
      link: v.link,
      thumbnailUrl: v.thumbnailUrl,
      channelId: result.channel.channelId,
      channelName: result.channel.title,
    })),
  };
}

/**
 * Build a snapshot entirely from scrape data when RSS is unavailable.
 * Shorts are filtered by duration (≤60s) instead of by link pattern.
 * Exported for unit testing.
 */
export function buildSnapshotFromScrape(scraped: ScrapedChannel): ChannelSnapshot {
  const videos: SnapshotVideo[] = scraped.videos
    .filter((v) => v.durationSeconds == null || v.durationSeconds > SHORTS_DURATION_THRESHOLD)
    .map((v) => ({
      videoId: v.videoId,
      title: v.title,
      description: v.description,
      publishedAt: v.publishedAt,
      link: `https://www.youtube.com/watch?v=${v.videoId}`,
      thumbnailUrl: buildThumbnailUrl(v.videoId),
      durationSeconds: v.durationSeconds,
    }));

  return {
    channelId: scraped.channelId,
    name: scraped.name,
    handle: scraped.handle,
    logoUrl: scraped.logoUrl,
    videos,
  };
}

/**
 * Pure merge — exported for unit testing.
 */
export function mergeSnapshot(feed: RssChannel, scraped: ScrapedChannel | null): ChannelSnapshot {
  const durationByVideoId = new Map<string, number>();
  if (scraped != null) {
    for (const v of scraped.videos) {
      if (v.durationSeconds != null) {
        durationByVideoId.set(v.videoId, v.durationSeconds);
      }
    }
  }

  const videos: SnapshotVideo[] = feed.videos
    .filter((v) => !isYouTubeShort(v))
    .map((v) => ({
      videoId: v.videoId,
      title: v.title,
      description: v.description,
      publishedAt: v.publishedAt,
      link: v.link,
      thumbnailUrl: v.thumbnailUrl ?? buildThumbnailUrl(v.videoId),
      durationSeconds: durationByVideoId.get(v.videoId) ?? null,
    }));

  return {
    channelId: feed.channelId,
    name: feed.name,
    handle: scraped?.handle ?? null,
    logoUrl: scraped?.logoUrl ?? null,
    videos,
  };
}
