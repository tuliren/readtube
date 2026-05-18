/**
 * Client for the TranscriptAPI REST endpoints we use outside the
 * subtitle/transcript flow:
 *   - `/youtube/channel/latest` (free): 15 most recent videos for a
 *     channel, used as a fallback when YouTube RSS is unavailable.
 *   - `/youtube/channel/resolve` (free): @handle / URL → canonical
 *     UC channel id, used by the add-video TranscriptAPI fallback.
 *
 * Both endpoints require `TRANSCRIPT_API_KEY` even though they are
 * billed as free.
 *
 * Docs: https://transcriptapi.com/docs/api/
 */
import { isEmptyString } from '@/lib/string';

const BASE_URL = 'https://transcriptapi.com/api/v2';

// ── Response shapes (from real API call, not docs) ─────────────────

interface ChannelLatestThumbnail {
  url: string;
  width: string;
  height: string;
}

interface ChannelLatestVideo {
  videoId: string;
  title: string;
  channelId: string;
  author: string;
  published: string;
  updated: string;
  link: string;
  description: string | null;
  thumbnail: ChannelLatestThumbnail;
  viewCount: string;
  starRating: {
    count: string;
    average: string;
    min: string;
    max: string;
  };
}

interface ChannelLatestResponse {
  channel: {
    channelId: string;
    title: string;
    author: string;
    url: string;
    published: string;
  };
  results: ChannelLatestVideo[];
}

interface ChannelResolveResponse {
  channel_id: string;
  resolved_from: string;
}

// ── Exported shapes ────────────────────────────────────────────────

export interface ChannelMeta {
  channelId: string;
  title: string;
}

export interface ChannelVideoMeta {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date;
  thumbnailUrl: string | null;
  /**
   * The original entry link from YouTube's RSS feed. Shorts use
   * `https://www.youtube.com/shorts/<id>` while regular videos use
   * `https://www.youtube.com/watch?v=<id>` — this is the canonical
   * signal for distinguishing the two formats.
   */
  link: string;
}

// ── Functions ──────────────────────────────────────────────────────

/**
 * Fetch the 15 most recent videos from TranscriptAPI's RSS-backed
 * endpoint. Returns per-video thumbnails.
 *
 * The `channel` parameter accepts @handles, channel URLs, or
 * UC-prefixed channel IDs — but in practice the API is more
 * reliable with @handles.
 *
 * Requires TRANSCRIPT_API_KEY. Throws on HTTP errors or network
 * failures — the caller should catch and decide whether to proceed
 * without metadata.
 */
export async function fetchChannelLatest(
  channelInput: string
): Promise<{ channel: ChannelMeta; videos: ChannelVideoMeta[] }> {
  console.info(`[youtube] Fetching via TranscriptAPI /channel/latest: ${channelInput}`);

  const apiKey = process.env.TRANSCRIPT_API_KEY;
  if (isEmptyString(apiKey)) {
    throw new Error('TRANSCRIPT_API_KEY is not set');
  }

  const url = `${BASE_URL}/youtube/channel/latest?channel=${encodeURIComponent(channelInput)}`;
  // See channelRss.ts for why we opt out of Next.js's fetch cache —
  // the refresh workflow calls this inside a step that runs outside a
  // Next.js request context, and the monkey-patched fetch can throw
  // "detached ArrayBuffer" when the cache machinery tries to slice
  // the already-consumed response body.
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TranscriptAPI /channel/latest ${res.status}: ${body}`);
  }

  const data: ChannelLatestResponse = await res.json();

  // Same RSS-backed source as the YouTube feed, so it can return
  // scheduled livestreams whose `published` is the scheduled start
  // time in the future. Drop those — see channelRss.ts for the why.
  const now = Date.now();
  const videos: ChannelVideoMeta[] = (data.results ?? [])
    .map((v) => ({
      videoId: v.videoId,
      title: v.title,
      description: v.description ?? '',
      publishedAt: new Date(v.published),
      thumbnailUrl: v.thumbnail?.url || null,
      link: v.link,
    }))
    .filter((v) => !Number.isNaN(v.publishedAt.getTime()) && v.publishedAt.getTime() <= now);

  return {
    channel: {
      channelId: data.channel.channelId,
      title: data.channel.title,
    },
    videos,
  };
}

/**
 * Resolve any channel reference (@handle, channel URL, or UC id) to
 * a canonical UC-prefixed channel id. Used by the add-video
 * TranscriptAPI fallback path to recover the channel id that's
 * normally scraped out of the watch page.
 *
 * Free endpoint. Requires `TRANSCRIPT_API_KEY`. Throws on HTTP errors
 * or network failures.
 */
export async function resolveChannelId(input: string): Promise<string> {
  const apiKey = process.env.TRANSCRIPT_API_KEY;
  if (isEmptyString(apiKey)) {
    throw new Error('TRANSCRIPT_API_KEY is not set');
  }

  const url = `${BASE_URL}/youtube/channel/resolve?input=${encodeURIComponent(input)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TranscriptAPI /channel/resolve ${res.status}: ${body}`);
  }

  const data: ChannelResolveResponse = await res.json();
  if (isEmptyString(data.channel_id)) {
    throw new Error(`TranscriptAPI /channel/resolve returned empty channel_id for ${input}`);
  }
  return data.channel_id;
}
