/**
 * Scrape a single YouTube watch page to extract the metadata we need
 * to persist a `Video` row and its owning `Channel`. Used by the
 * "add individual video" flow in `lib/workflows/add-video`.
 *
 * YouTube's public watch page embeds rich itemprop microdata that
 * includes the channel id, author handle, publish date, duration
 * (ISO-8601), title, description and thumbnail. No API key required.
 */
import { buildThumbnailUrl } from './urls';

const YT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface VideoSnapshot {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: Date;
  /** Null if the page didn't expose a parseable ISO-8601 duration. */
  durationSeconds: number | null;
  channel: {
    sourceId: string;
    name: string;
    /** Channel handle without the leading `@`, or null. */
    handle: string | null;
    /** Logo URL from og:image on the channel page, best-effort. */
    logoUrl: string | null;
  };
}

/**
 * Extracts a YouTube video id from several common URL shapes. Also
 * accepts a bare 11-char id.
 */
export function extractVideoId(input: string): string | null {
  if (input == null || typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Bare video id (11 chars, A-Za-z0-9_-)
  if (/^[\w-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const id = url.pathname.replace(/^\/+/, '').split('/')[0];
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (!host.includes('youtube.com')) {
      return null;
    }
    // /watch?v=<id>
    const v = url.searchParams.get('v');
    if (v != null && /^[\w-]{11}$/.test(v)) {
      return v;
    }
    // /shorts/<id> or /embed/<id> or /live/<id>
    const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/);
    if (m != null) {
      return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parses ISO-8601 duration (e.g. "PT1H2M3S", "PT45S") into seconds.
 * Returns null if the input is missing or malformed.
 */
export function parseIsoDurationSeconds(iso: string | null | undefined): number | null {
  if (iso == null) {
    return null;
  }
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (m == null) {
    return null;
  }
  const hours = m[1] != null ? parseInt(m[1], 10) : 0;
  const mins = m[2] != null ? parseInt(m[2], 10) : 0;
  const secs = m[3] != null ? parseInt(m[3], 10) : 0;
  const total = hours * 3600 + mins * 60 + secs;
  return total > 0 ? total : null;
}

/** HTML entity decode for the small set that shows up in og meta tags. */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m != null ? decodeHtmlEntities(m[1]) : null;
}

/**
 * Fetches the watch page for `videoId` and extracts a VideoSnapshot.
 * Throws if the page is unreachable or missing required fields
 * (channel id, title, published date).
 */
export async function fetchVideoSnapshot(videoId: string): Promise<VideoSnapshot> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await fetch(watchUrl, {
    headers: { 'User-Agent': YT_USER_AGENT },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch video page: ${response.status}`);
  }
  const html = await response.text();

  const channelId = firstMatch(html, /<meta itemprop="identifier" content="(UC[\w-]{20,})"/);
  // Fallback: channelId may appear inside the richly-embedded JSON blob
  // but the <meta itemprop="channelId"> form is standard on modern pages.
  const channelIdAlt = channelId ?? firstMatch(html, /"channelId":"(UC[\w-]{20,})"/);
  const resolvedChannelId = channelId ?? channelIdAlt;
  if (resolvedChannelId == null) {
    throw new Error('Could not extract channel id from watch page');
  }

  const title =
    firstMatch(html, /<meta name="title" content="([^"]+)"/) ??
    firstMatch(html, /<meta property="og:title" content="([^"]+)"/);
  if (title == null) {
    throw new Error('Could not extract video title');
  }

  const description =
    firstMatch(html, /<meta name="description" content="([^"]+)"/) ??
    firstMatch(html, /<meta property="og:description" content="([^"]+)"/) ??
    '';

  const thumbnailUrl =
    firstMatch(html, /<meta property="og:image" content="([^"]+)"/) ?? buildThumbnailUrl(videoId);

  const publishedRaw = firstMatch(html, /<meta itemprop="datePublished" content="([^"]+)"/);
  const publishedAt = publishedRaw != null ? new Date(publishedRaw) : null;
  if (publishedAt == null || Number.isNaN(publishedAt.getTime())) {
    throw new Error('Could not extract publish date');
  }

  const durationIso = firstMatch(html, /<meta itemprop="duration" content="([^"]+)"/);
  const durationSeconds = parseIsoDurationSeconds(durationIso);

  const channelName =
    firstMatch(html, /"author":"([^"]+)"/) ??
    firstMatch(html, /<link itemprop="name" content="([^"]+)"/) ??
    'Unknown Channel';

  const channelPageUrl =
    firstMatch(html, /<span itemprop="author"[^>]*>\s*<link itemprop="url" href="([^"]+)"/) ??
    firstMatch(html, /"ownerProfileUrl":"([^"]+)"/);
  let handle: string | null = null;
  if (channelPageUrl != null) {
    const m = channelPageUrl.match(/\/@([\w.-]+)/);
    if (m != null) {
      // Store with the leading `@` to match channelScrape.ts and the
      // `channel_unique_handle` constraint — otherwise the same row
      // flip-flops between "@mkbhd" and "mkbhd" as different code
      // paths touch it.
      handle = `@${m[1]}`;
    }
  }

  return {
    videoId,
    title,
    description,
    thumbnailUrl,
    publishedAt,
    durationSeconds,
    channel: {
      sourceId: resolvedChannelId,
      name: channelName,
      handle,
      logoUrl: null,
    },
  };
}
