import type { ChannelSnapshot, SnapshotVideo } from '@/lib/platforms/types';
import { type RssChannel, fetchRssFeed, isYouTubeShort } from '@/lib/platforms/youtube/channelRss';
import { type ScrapedChannel, scrapeChannel } from '@/lib/platforms/youtube/channelScrape';
import { fetchChannelLatest } from '@/lib/platforms/youtube/transcriptApi';
import { buildRssUrl, buildThumbnailUrl } from '@/lib/platforms/youtube/urls';

// Re-exported so existing `@/lib/platforms/youtube/channelSnapshot` imports keep
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
 *    `/shorts/` vs `/watch?v=` links for Shorts filtering. Limited to
 *    the 15 most recent uploads. Older videos returned by scrape but
 *    missing from RSS are appended as `isScraped: true` entries —
 *    persisted on create, skipped on update.
 * 2. TranscriptAPI `/channel/latest` — same data shape as RSS
 *    (including `/shorts/` links). Used when RSS returns 404, **and**
 *    also when both scrape and RSS succeed but return zero videos
 *    (observed when YouTube soft-blocks our hosting IP by returning
 *    200 with empty channel pages and empty feeds — TranscriptAPI
 *    routes via different infrastructure).
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
  let triedTranscriptApi = false;

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
      triedTranscriptApi = true;
    }
  } else {
    // Handle-based input — can't build RSS URL until we know the UC id.
    scraped = await scrapeChannel(args.channelPageUrl);
    try {
      feed = await fetchRssFeed(buildRssUrl(scraped.channelId));
    } catch (err) {
      console.warn('[channelSnapshot] RSS failed:', err);
      feed = await tryTranscriptApiFallback(scraped, args.channelPageUrl);
      triedTranscriptApi = true;
    }
  }

  // YouTube has been observed to soft-block requests from certain
  // hosting IPs (e.g. Vercel) by returning 200 with empty channel
  // pages *and* empty RSS feeds. If neither source produced a video,
  // try TranscriptAPI before giving up — it routes via different
  // infrastructure.
  if (
    !triedTranscriptApi &&
    (feed?.videos.length ?? 0) === 0 &&
    (scraped?.videos.length ?? 0) === 0
  ) {
    console.warn('[channelSnapshot] scrape + RSS returned zero videos — trying TranscriptAPI');
    const fallback = await tryTranscriptApiFallback(scraped, args.channelPageUrl);
    if (fallback != null && fallback.videos.length > 0) {
      feed = fallback;
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
  // `isScraped` applies to every video here too: this whole path runs
  // only when RSS + TranscriptAPI both failed, so the data is the
  // lower-fidelity scrape. On a later refresh where RSS is healthy, we
  // want create-or-skip semantics so truncated titles don't overwrite
  // the richer RSS data that mergeSnapshot will store.
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
      isScraped: true,
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
  // Scheduled premieres / upcoming livestreams the channel-page
  // scrape identified. RSS reports the upload time, not the air time,
  // so RSS's own `published > now` filter misses pre-uploaded
  // premieres — drop them here using the scrape's authoritative
  // `upcomingEventData` signal.
  const upcomingVideoIds = new Set<string>(scraped?.upcomingVideoIds ?? []);
  // Members-only entries the channel-page scrape identified. The
  // transcript path can't load these (the watch page is paywalled),
  // so drop them from the merged list. RSS typically omits members-
  // only uploads, but propagate the filter for safety.
  const memberOnlyVideoIds = new Set<string>(scraped?.memberOnlyVideoIds ?? []);
  if (scraped != null) {
    for (const v of scraped.videos) {
      if (v.durationSeconds != null) {
        durationByVideoId.set(v.videoId, v.durationSeconds);
      }
    }
  }

  const videos: SnapshotVideo[] = feed.videos
    .filter(
      (v) =>
        !isYouTubeShort(v) && !upcomingVideoIds.has(v.videoId) && !memberOnlyVideoIds.has(v.videoId)
    )
    .map((v) => ({
      videoId: v.videoId,
      title: v.title,
      description: v.description,
      publishedAt: v.publishedAt,
      link: v.link,
      thumbnailUrl: v.thumbnailUrl ?? buildThumbnailUrl(v.videoId),
      durationSeconds: durationByVideoId.get(v.videoId) ?? null,
    }));

  // Append scrape-only older videos that fell outside RSS's 15-item
  // window. The /videos tab is long-form only (Shorts have their own
  // /shorts tab), so no duration filter is needed.
  const rssVideoIds = new Set(feed.videos.map((v) => v.videoId));
  if (scraped != null) {
    for (const v of scraped.videos) {
      if (rssVideoIds.has(v.videoId)) {
        continue;
      }
      videos.push({
        videoId: v.videoId,
        title: v.title,
        description: v.description,
        publishedAt: v.publishedAt,
        link: `https://www.youtube.com/watch?v=${v.videoId}`,
        thumbnailUrl: buildThumbnailUrl(v.videoId),
        durationSeconds: v.durationSeconds,
        isScraped: true,
      });
    }
  }

  return {
    channelId: feed.channelId,
    name: feed.name,
    handle: scraped?.handle ?? null,
    logoUrl: scraped?.logoUrl ?? null,
    videos,
  };
}
