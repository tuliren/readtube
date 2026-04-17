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
    /**
     * Channel handle with the leading `@` (e.g. "@mkbhd"), or null.
     * Matches the storage convention in `channelScrape.ts` and the
     * `channel_unique_handle` DB constraint — consumers can use the
     * value verbatim without prefixing.
     */
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
 * YouTube oEmbed response — the subset of fields we use.
 * Public endpoint, no API key required. Always available for
 * public videos. More reliable than scraping meta tags because
 * it isn't subject to consent-wall HTML variations.
 */
interface OEmbedResponse {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
}

async function fetchOEmbed(videoId: string): Promise<OEmbedResponse | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as OEmbedResponse;
  } catch {
    return null;
  }
}

/**
 * Fetches video metadata via oEmbed (title, channel name, handle)
 * plus a watch-page scrape for fields oEmbed doesn't expose
 * (channelId, publishedAt, duration). Falls back gracefully when
 * specific scrape regexes miss — the only hard requirement is
 * channelId.
 */
export async function fetchVideoSnapshot(videoId: string): Promise<VideoSnapshot> {
  // Fire oEmbed and page fetch in parallel — they're independent.
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const [oembed, response] = await Promise.all([
    fetchOEmbed(videoId),
    fetch(watchUrl, { headers: { 'User-Agent': YT_USER_AGENT }, cache: 'no-store' }),
  ]);
  if (!response.ok) {
    throw new Error(`Failed to fetch video page: ${response.status}`);
  }
  const html = await response.text();

  // ── Channel ID (required) — scrape-only; oEmbed doesn't expose it ──
  const channelId =
    firstMatch(html, /<meta itemprop="identifier" content="(UC[\w-]{20,})"/) ??
    firstMatch(html, /"channelId":"(UC[\w-]{20,})"/);
  if (channelId == null) {
    throw new Error('Could not extract channel id from watch page');
  }

  // ── Title — prefer oEmbed (always present for public videos) ──
  const title =
    oembed?.title ??
    firstMatch(html, /<meta name="title" content="([^"]*)"/) ??
    firstMatch(html, /<meta property="og:title" content="([^"]*)"/) ??
    firstMatch(html, /"title":"([^"]+)"/);
  if (title == null) {
    throw new Error('Could not extract video title');
  }

  // ── Description — scrape; oEmbed doesn't include it ──
  const description =
    firstMatch(html, /<meta name="description" content="([^"]*)"/) ??
    firstMatch(html, /<meta property="og:description" content="([^"]*)"/) ??
    '';

  const thumbnailUrl =
    oembed?.thumbnail_url ??
    firstMatch(html, /<meta property="og:image" content="([^"]+)"/) ??
    buildThumbnailUrl(videoId);

  // ── Published date — best-effort; watch pages served to some
  // serverless IPs omit the itemprop microdata entirely. Falls back
  // through alternate meta tags, JSON-LD, and finally the current
  // time rather than failing the add. Publish date is nice-to-have;
  // a missing date should not block a video from being added.
  const publishedRaw =
    firstMatch(html, /<meta itemprop="datePublished" content="([^"]+)"/) ??
    firstMatch(html, /<meta itemprop="uploadDate" content="([^"]+)"/) ??
    firstMatch(html, /"datePublished"\s*:\s*"([^"]+)"/) ??
    firstMatch(html, /"uploadDate"\s*:\s*"([^"]+)"/);
  const parsed = publishedRaw != null ? new Date(publishedRaw) : null;
  const publishedAt = parsed != null && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  if (publishedRaw == null || parsed == null || Number.isNaN(parsed.getTime())) {
    console.warn(
      `[videoSnapshot] Could not extract publish date for ${videoId}; falling back to now`
    );
  }

  const durationIso = firstMatch(html, /<meta itemprop="duration" content="([^"]+)"/);
  const durationSeconds = parseIsoDurationSeconds(durationIso);

  // ── Channel metadata — prefer oEmbed for name; scrape for handle ──
  const channelName =
    oembed?.author_name ?? firstMatch(html, /"author":"([^"]+)"/) ?? 'Unknown Channel';

  const channelPageUrl = oembed?.author_url ?? firstMatch(html, /"ownerProfileUrl":"([^"]+)"/);
  let handle: string | null = null;
  if (channelPageUrl != null) {
    const m = channelPageUrl.match(/\/@([\w.-]+)/);
    if (m != null) {
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
      sourceId: channelId,
      name: channelName,
      handle,
      logoUrl: null,
    },
  };
}
