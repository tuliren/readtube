/**
 * Fetch the metadata snapshot we need to persist a YouTube `Video`
 * row + its owning `Channel` row. Used by the "add individual video"
 * flow in `lib/workflows/add-video`.
 *
 * Strategy is orchestrated here:
 *   1. `fetchViaWatchPage` — scrape `https://www.youtube.com/watch?v=…`.
 *      No API key, richest data (description, duration, publish date),
 *      but YouTube rate-limits Vercel's egress IPs with 429.
 *   2. `fetchViaTranscriptApi` — call TranscriptAPI's
 *      `/youtube/transcript?…&send_metadata=true` and
 *      `/youtube/channel/resolve`. Recovers the only field that's
 *      hard-required (the UC channel id) plus title/thumbnail/handle.
 *      Costs 1 transcript credit but bundles the transcript itself,
 *      which is persisted by the add-video workflow so the reader
 *      doesn't immediately re-fetch on first open.
 *
 * Mirrors the orchestrator-with-named-strategies layout used by
 * `subtitles/index.ts` / `subtitles/fetchVia*.ts`.
 */
import type { PlatformTranscriptResult, VideoSnapshotResult } from '@/lib/platforms/base';
import type { TranscriptSegment, VideoSnapshot } from '@/lib/platforms/types';
import { isEmptyString } from '@/lib/string';

import { UNKNOWN_CHANNEL_NAME } from './constants';
import { resolveChannelId } from './transcriptApi';
import { YOUTUBE_VIDEO_ID_PATTERN, buildThumbnailUrl } from './urls';

const YT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export type { VideoSnapshot };

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
  if (YOUTUBE_VIDEO_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const id = url.pathname.replace(/^\/+/, '').split('/')[0];
      return YOUTUBE_VIDEO_ID_PATTERN.test(id) ? id : null;
    }
    if (!host.includes('youtube.com')) {
      return null;
    }
    // /watch?v=<id>
    const v = url.searchParams.get('v');
    if (v != null && YOUTUBE_VIDEO_ID_PATTERN.test(v)) {
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
 * Parse a YouTube channel `@handle` out of an author URL of any of
 * the shapes oEmbed / TranscriptAPI return:
 *   - https://www.youtube.com/@mkbhd            → "@mkbhd"
 *   - https://www.youtube.com/user/marquesbrownlee → null
 *   - https://www.youtube.com/channel/UC…       → null
 */
function extractHandleFromAuthorUrl(authorUrl: string | null | undefined): string | null {
  if (authorUrl == null) {
    return null;
  }
  const m = authorUrl.match(/\/@([\w.-]+)/);
  return m != null ? `@${m[1]}` : null;
}

/**
 * Strategy 1: scrape the YouTube watch page directly. Returns null
 * when the watch page is unavailable (429, 5xx, network blip, etc.)
 * so the orchestrator can fall back to TranscriptAPI. Throws on
 * structural parse failures (page reachable but missing channel id
 * or title) — those are not retryable through the fallback either.
 */
async function fetchViaWatchPage(videoId: string): Promise<VideoSnapshot | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const [oembed, response] = await Promise.all([
    fetchOEmbed(videoId),
    fetch(watchUrl, { headers: { 'User-Agent': YT_USER_AGENT }, cache: 'no-store' }),
  ]);
  if (!response.ok) {
    console.warn(`[videoSnapshot] watch page returned ${response.status} for ${videoId}`);
    return null;
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
  // serverless IPs omit the itemprop microdata entirely. Tries a few
  // alternate sources and returns null if none hit. A missing date
  // shouldn't block the add — the caller picks a fallback (e.g.
  // current time on create) and can backfill from a later scrape.
  const publishedRaw =
    firstMatch(html, /<meta itemprop="datePublished" content="([^"]+)"/) ??
    firstMatch(html, /<meta itemprop="uploadDate" content="([^"]+)"/) ??
    firstMatch(html, /"datePublished"\s*:\s*"([^"]+)"/) ??
    firstMatch(html, /"uploadDate"\s*:\s*"([^"]+)"/);
  const parsed = publishedRaw != null ? new Date(publishedRaw) : null;
  const publishedAt = parsed != null && !Number.isNaN(parsed.getTime()) ? parsed : null;
  if (publishedAt == null) {
    console.warn(`[videoSnapshot] Could not extract publish date for ${videoId}`);
  }

  const durationIso = firstMatch(html, /<meta itemprop="duration" content="([^"]+)"/);
  const durationSeconds = parseIsoDurationSeconds(durationIso);

  // ── Channel metadata — prefer oEmbed for name; scrape for handle ──
  const channelName =
    oembed?.author_name ?? firstMatch(html, /"author":"([^"]+)"/) ?? UNKNOWN_CHANNEL_NAME;

  const channelPageUrl = oembed?.author_url ?? firstMatch(html, /"ownerProfileUrl":"([^"]+)"/);
  const handle = extractHandleFromAuthorUrl(channelPageUrl);

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

interface TranscriptApiVideoResponse {
  video_id: string;
  language: string;
  transcript: Array<{ text: string; start: number; duration: number }>;
  metadata?: {
    title?: string;
    author_name?: string;
    author_url?: string;
    thumbnail_url?: string;
  };
}

/**
 * Strategy 2: call TranscriptAPI's `/youtube/transcript` endpoint
 * with `send_metadata=true` to recover both the bare video metadata
 * (title, channel name, channel URL, thumbnail) and the transcript
 * itself in a single 1-credit request, then resolve the UC channel
 * id via the free `/channel/resolve` endpoint.
 *
 * Throws on any upstream failure — there's no further fallback below
 * this in `fetchVideoSnapshot`. The caller surfaces the failure as
 * `AddVideoError(FETCH_FAILED)`.
 *
 * Returns the transcript alongside the snapshot so the add-video
 * workflow can persist it (we've already paid for the credit;
 * fetching it again on first reader open would double-bill).
 */
async function fetchViaTranscriptApi(
  videoId: string
): Promise<{ snapshot: VideoSnapshot; prefetchedTranscript: PlatformTranscriptResult }> {
  const apiKey = process.env.TRANSCRIPT_API_KEY;
  if (isEmptyString(apiKey)) {
    throw new Error('TRANSCRIPT_API_KEY is not set');
  }

  const url = `https://transcriptapi.com/api/v2/youtube/transcript?video_url=${videoId}&send_metadata=true`;
  console.info(`[videoSnapshot] Falling back to TranscriptAPI for ${videoId}`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TranscriptAPI /youtube/transcript ${res.status}: ${body}`);
  }

  const data: TranscriptApiVideoResponse = await res.json();
  const metadata = data.metadata;
  if (metadata == null || isEmptyString(metadata.title) || isEmptyString(metadata.author_url)) {
    throw new Error('TranscriptAPI response is missing required metadata block');
  }

  // The transcript endpoint doesn't return the UC channel id; pull
  // it from the free `/channel/resolve` endpoint using the author
  // URL. `/channel/resolve` accepts @handle, full channel URL, or a
  // bare UC id, so passing `author_url` directly works for both
  // modern (/@handle) and legacy (/user/<name>, /channel/UC…) URLs.
  const channelId = await resolveChannelId(metadata.author_url);

  const segments: TranscriptSegment[] = data.transcript.map((seg) => ({
    startMs: Math.round(seg.start * 1000),
    endMs: Math.round((seg.start + seg.duration) * 1000),
    text: seg.text,
  }));

  const snapshot: VideoSnapshot = {
    videoId,
    title: metadata.title,
    // Transcript endpoint doesn't expose description / duration /
    // publish date — leave them empty/null. Downstream upserts
    // tolerate all three and a later channel-refresh backfills.
    description: '',
    thumbnailUrl: metadata.thumbnail_url ?? buildThumbnailUrl(videoId),
    publishedAt: null,
    durationSeconds: null,
    channel: {
      sourceId: channelId,
      name: metadata.author_name ?? UNKNOWN_CHANNEL_NAME,
      handle: extractHandleFromAuthorUrl(metadata.author_url),
      logoUrl: null,
    },
  };

  return {
    snapshot,
    prefetchedTranscript: { segments, language: data.language },
  };
}

/**
 * Fetch a YouTube video's metadata for the add-video flow. Tries
 * the watch-page scrape first; falls back to TranscriptAPI when the
 * watch page is unreachable (e.g. YouTube 429-ing the Vercel egress
 * IP pool). The fallback also returns the transcript, which the
 * caller persists to avoid an immediate re-fetch on first reader
 * open.
 */
export async function fetchVideoSnapshot(videoId: string): Promise<VideoSnapshotResult> {
  const watchPageSnapshot = await fetchViaWatchPage(videoId);
  if (watchPageSnapshot != null) {
    return { snapshot: watchPageSnapshot, prefetchedTranscript: null };
  }
  return fetchViaTranscriptApi(videoId);
}
