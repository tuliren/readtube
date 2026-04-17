import { XMLParser } from 'fast-xml-parser';

import { UNKNOWN_CHANNEL_NAME } from './constants';

export interface RssVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date;
  /**
   * The canonical link from YouTube's RSS entry. Regular videos use
   * `https://www.youtube.com/watch?v=<id>`; Shorts use
   * `https://www.youtube.com/shorts/<id>` — which is how we tell them
   * apart during ingest.
   */
  link: string;
  /** From `<media:thumbnail url="…" />`; may be absent on some entries. */
  thumbnailUrl: string | null;
  /** Per-entry author/channel info. For channel RSS feeds this equals
   *  the feed-level channel. For playlist RSS feeds each entry may
   *  carry a different channel (the actual uploader), so we extract
   *  it per-entry from `<author>` and `<yt:channelId>`. */
  channelId: string | null;
  channelName: string | null;
}

/**
 * YouTube's channel RSS marks Shorts by using `/shorts/<id>` as the
 * entry link's path, rather than `/watch?v=<id>`. This is the
 * canonical signal — Shorts are a distinct content type on YouTube,
 * not just a duration threshold.
 */
export function isYouTubeShort(video: { link: string }): boolean {
  return video.link.includes('/shorts/');
}

export interface RssChannel {
  channelId: string;
  /** Feed-level `<title>`. For channel feeds this is the channel
   *  name; for playlist feeds it's the playlist title. Callers that
   *  want the owning channel's display name should prefer `authorName`. */
  name: string;
  /** Feed-level `<author><name>` — the owning channel's display name
   *  regardless of whether the feed is a channel or playlist feed.
   *  Null if the feed omitted author info. */
  authorName: string | null;
  videos: RssVideo[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'entry',
});

export async function fetchRssFeed(rssUrl: string): Promise<RssChannel> {
  // `cache: 'no-store'` rather than `next: { revalidate: 0 }` — the
  // workflow step runs outside a Next.js request context, so the
  // `next` options aren't valid there and the monkey-patched fetch
  // can throw "detached ArrayBuffer" when the cache machinery tries
  // to slice the already-consumed response body.
  const response = await fetch(rssUrl, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new Error('Failed to parse RSS feed: malformed XML');
  }

  const feed = parsed.feed as Record<string, unknown> | undefined;
  if (!feed) {
    throw new Error('Invalid RSS feed: missing feed element');
  }

  // Channel ID from yt:channelId element. YouTube's RSS is inconsistent:
  // the feed-level <yt:channelId> drops the "UC" prefix (e.g. emits
  // "2cRwTuSWxxEtrRnT4lrlQA" for channel UC2cRwTuSWxxEtrRnT4lrlQA),
  // while every entry-level <yt:channelId> keeps the full "UC..."
  // form. Normalize so downstream code always sees the canonical ID
  // that matches the rest of YouTube.
  const rawChannelId = (feed['yt:channelId'] as string | undefined)?.trim();
  if (!rawChannelId) {
    throw new Error('Invalid RSS feed: missing channel ID');
  }
  const channelId = rawChannelId.startsWith('UC') ? rawChannelId : `UC${rawChannelId}`;

  const channelName = (feed.title as string | undefined)?.trim() ?? UNKNOWN_CHANNEL_NAME;
  const feedAuthor = feed.author as Record<string, unknown> | undefined;
  const authorName = (feedAuthor?.name as string | undefined)?.trim() ?? null;

  const entries = (feed.entry as Record<string, unknown>[] | undefined) ?? [];

  const videos: RssVideo[] = entries
    .map((entry) => {
      const videoId = (entry['yt:videoId'] as string | undefined)?.trim();
      const title = (entry.title as string | undefined)?.trim();
      const published = entry.published as string | undefined;
      const mediaGroup = entry['media:group'] as Record<string, unknown> | undefined;
      const description = (mediaGroup?.['media:description'] as string | undefined)?.trim() ?? '';
      const link = extractLinkHref(entry.link);
      const thumbnailUrl = extractThumbnailUrl(mediaGroup?.['media:thumbnail']);

      if (!videoId || !title || !published || !link) {
        return null;
      }

      const publishedAt = new Date(published);
      if (isNaN(publishedAt.getTime())) {
        return null;
      }

      // Per-entry channel — for playlist RSS feeds, each entry's
      // author is the actual uploader rather than the playlist owner.
      const entryChannelId = (entry['yt:channelId'] as string | undefined)?.trim() ?? null;
      const author = entry.author as Record<string, unknown> | undefined;
      const entryChannelName = (author?.name as string | undefined)?.trim() ?? null;

      return {
        videoId,
        title,
        description,
        publishedAt,
        link,
        thumbnailUrl,
        channelId: entryChannelId,
        channelName: entryChannelName,
      };
    })
    .filter((v): v is RssVideo => v !== null);

  return { channelId, name: channelName, authorName, videos };
}

/**
 * `<link>` may be a single element, an array of elements, or a plain
 * string depending on how fast-xml-parser handled the entry. We want
 * the `rel="alternate"` href (the canonical video URL), falling back
 * to the first href if `rel` is absent.
 */
function extractLinkHref(raw: unknown): string | null {
  if (raw == null) {
    return null;
  }
  const candidates = Array.isArray(raw) ? raw : [raw];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      return candidate;
    }
    if (typeof candidate === 'object') {
      const obj = candidate as Record<string, unknown>;
      const rel = obj['@_rel'] as string | undefined;
      const href = obj['@_href'] as string | undefined;
      if (href != null && (rel === 'alternate' || rel == null)) {
        return href;
      }
    }
  }
  return null;
}

function extractThumbnailUrl(raw: unknown): string | null {
  if (raw == null) {
    return null;
  }
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first != null && typeof first === 'object') {
    const url = (first as Record<string, unknown>)['@_url'];
    if (typeof url === 'string') {
      return url;
    }
  }
  return null;
}
