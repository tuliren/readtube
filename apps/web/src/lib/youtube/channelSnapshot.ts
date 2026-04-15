import { type RssChannel, fetchRssFeed, isYouTubeShort } from '@/lib/youtube/channelRss';
import { type ScrapedChannel, scrapeChannel } from '@/lib/youtube/channelScrape';
import { buildRssUrl, buildThumbnailUrl } from '@/lib/youtube/urls';

/**
 * A single ingest-ready video produced by merging RSS + scrape data.
 *
 * - title, description, publishedAt, link come from the RSS feed —
 *   RSS descriptions are complete (scrape truncates them) and the
 *   RSS `published` timestamp is the true publish time (the scrape's
 *   "2 weeks ago" text is actually the last-updated time).
 * - durationSeconds comes from the channel-page scrape, which is the
 *   only free source of video length. Null if scrape failed or the
 *   video wasn't in the scrape grid.
 * - thumbnailUrl prefers the RSS `media:thumbnail`; if the feed omits
 *   it, we fall back to the deterministic `hqdefault.jpg` URL so this
 *   field is always populated.
 */
export interface SnapshotVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date;
  link: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
}

export interface ChannelSnapshot {
  channelId: string;
  name: string;
  /** From scrape. Null if scrape failed or the channel has no handle. */
  handle: string | null;
  /** From scrape. Null if scrape failed. */
  logoUrl: string | null;
  /** Shorts (RSS links containing `/shorts/`) are already filtered out. */
  videos: SnapshotVideo[];
}

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
 * Behaviour on partial failure:
 * - RSS failure is fatal — without it we have no authoritative video
 *   list and can't safely filter Shorts.
 * - Scrape failure is tolerated — we return the snapshot with
 *   `handle: null`, `logoUrl: null`, and every video's
 *   `durationSeconds: null`. This preserves the refresh workflow's
 *   long-standing "best-effort scrape" posture.
 */
export async function fetchChannelSnapshot(args: {
  channelPageUrl: string;
  rssUrl?: string;
}): Promise<ChannelSnapshot> {
  let scraped: ScrapedChannel | null = null;
  let feed: RssChannel;

  if (args.rssUrl != null) {
    const [scrapeResult, rssResult] = await Promise.allSettled([
      scrapeChannel(args.channelPageUrl),
      fetchRssFeed(args.rssUrl),
    ]);

    if (rssResult.status !== 'fulfilled') {
      throw rssResult.reason instanceof Error
        ? rssResult.reason
        : new Error(String(rssResult.reason));
    }
    feed = rssResult.value;

    if (scrapeResult.status === 'fulfilled') {
      scraped = scrapeResult.value;
    } else {
      console.warn('[channelSnapshot] scrape failed, continuing RSS-only:', scrapeResult.reason);
    }
  } else {
    // Handle-based input — can't build RSS URL until we know the UC id.
    scraped = await scrapeChannel(args.channelPageUrl);
    feed = await fetchRssFeed(buildRssUrl(scraped.channelId));
  }

  return mergeSnapshot(feed, scraped);
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
