import { XMLParser } from 'fast-xml-parser';

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
}

export interface RssChannel {
  channelId: string;
  name: string;
  videos: RssVideo[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'entry',
});

export async function fetchRssFeed(rssUrl: string): Promise<RssChannel> {
  const response = await fetch(rssUrl, {
    next: { revalidate: 0 },
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

  // Channel ID from yt:channelId element
  const channelId = (feed['yt:channelId'] as string | undefined)?.trim();
  if (!channelId) {
    throw new Error('Invalid RSS feed: missing channel ID');
  }

  const channelName = (feed.title as string | undefined)?.trim() ?? 'Unknown Channel';

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

      return { videoId, title, description, publishedAt, link, thumbnailUrl };
    })
    .filter((v): v is RssVideo => v !== null);

  return { channelId, name: channelName, videos };
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
