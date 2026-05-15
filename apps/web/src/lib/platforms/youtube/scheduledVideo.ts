/**
 * Detect whether a YouTube video is a scheduled premiere / upcoming
 * livestream that hasn't aired yet. We want to tell this apart from
 * a video that is permanently captionless so the transcript pipeline
 * doesn't sticky-flag a future-dated video as `transcript_unavailable`
 * — its captions don't exist *yet*, but they will once it airs.
 *
 * Two detection strategies, mirroring the rest of the YouTube module:
 *
 *  1. Scrape the watch page (`https://www.youtube.com/watch?v=<id>`).
 *     The HTML carries an unambiguous `"isUpcoming":true` flag plus a
 *     `liveBroadcastDetails.startTimestamp` ISO date. Free, no API
 *     credit, but rate-limited from Vercel egress IPs.
 *
 *  2. Fall back to TranscriptAPI's `/channel/latest` and look up the
 *     video by id in the result set. Scheduled videos appear there
 *     with `published` set to the future scheduled-start time (see
 *     `channelRss.ts` — the channel-add path filters those out for
 *     the same reason). Routed through different infrastructure than
 *     a Vercel-IP watch-page hit.
 */
import { isEmptyString } from '@/lib/string';

const YT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface ScheduledStatus {
  /** Either the watch-page scrape said `isUpcoming:true`, or the
   *  TranscriptAPI fallback saw a `published` strictly after `now`. */
  isScheduled: boolean;
  /** Best-effort scheduled-start time. Pulled from
   *  `liveBroadcastDetails.startTimestamp` (scrape) or `published`
   *  (TranscriptAPI). Null when no signal carried a parseable date. */
  scheduledStartTime: Date | null;
  /** Which strategy actually answered. `none` means both signals
   *  were unreachable / inconclusive and the caller should treat the
   *  result as "not detected as scheduled". */
  source: 'scrape' | 'transcriptApi' | 'none';
}

/**
 * Parse the upcoming / scheduled signals out of a raw YouTube watch-
 * page HTML. Exported for direct testing — the watch page is large,
 * so unit tests feed in a fixture HTML rather than hitting YouTube.
 */
export function parseScheduledFromHtml(html: string): ScheduledStatus {
  const isUpcoming = /"isUpcoming"\s*:\s*true/.test(html);
  if (!isUpcoming) {
    return { isScheduled: false, scheduledStartTime: null, source: 'scrape' };
  }

  // `liveBroadcastDetails` is the cleanest source — it carries an
  // ISO-8601 string we can hand straight to `new Date()`.
  const iso = html.match(/"liveBroadcastDetails"\s*:\s*\{[^}]*"startTimestamp"\s*:\s*"([^"]+)"/);
  if (iso != null) {
    const d = new Date(iso[1]);
    if (!Number.isNaN(d.getTime())) {
      return { isScheduled: true, scheduledStartTime: d, source: 'scrape' };
    }
  }

  // Older / alternate shape: a unix timestamp string inside the
  // offline-slate renderer. Used when YouTube serves a stripped-down
  // page (e.g., the consent wall variant).
  const unix = html.match(/"scheduledStartTime"\s*:\s*"(\d+)"/);
  if (unix != null) {
    const seconds = parseInt(unix[1], 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      return {
        isScheduled: true,
        scheduledStartTime: new Date(seconds * 1000),
        source: 'scrape',
      };
    }
  }

  // `isUpcoming:true` was seen but no parseable start time — still
  // worth flagging as scheduled so the caller doesn't flip the
  // sticky transcript-unavailable bit.
  return { isScheduled: true, scheduledStartTime: null, source: 'scrape' };
}

async function detectViaWatchPage(videoId: string): Promise<ScheduledStatus | null> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': YT_USER_AGENT },
      cache: 'no-store',
    });
  } catch (err) {
    console.warn(`[scheduledVideo] watch page network error for ${videoId}:`, err);
    return null;
  }
  if (!response.ok) {
    console.warn(`[scheduledVideo] watch page returned ${response.status} for ${videoId}`);
    return null;
  }
  const html = await response.text();
  return parseScheduledFromHtml(html);
}

interface ChannelLatestResponse {
  results?: Array<{ videoId: string; published: string }>;
}

async function detectViaTranscriptApi(
  videoId: string,
  channelInput: string
): Promise<ScheduledStatus | null> {
  const apiKey = process.env.TRANSCRIPT_API_KEY;
  if (isEmptyString(apiKey)) {
    return null;
  }
  const url = `https://transcriptapi.com/api/v2/youtube/channel/latest?channel=${encodeURIComponent(channelInput)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
  } catch (err) {
    console.warn(`[scheduledVideo] TranscriptAPI /channel/latest network error:`, err);
    return null;
  }
  if (!response.ok) {
    console.warn(`[scheduledVideo] TranscriptAPI /channel/latest ${response.status}`);
    return null;
  }
  const data: ChannelLatestResponse = await response.json();
  const match = (data.results ?? []).find((v) => v.videoId === videoId);
  if (match == null) {
    // Channel returned a result set that doesn't include the video.
    // Means we can't say either way — caller treats as "not
    // detected as scheduled" rather than "definitely available."
    return null;
  }
  const published = new Date(match.published);
  if (Number.isNaN(published.getTime())) {
    return null;
  }
  // Caveat: this only catches *livestream*-style scheduled videos —
  // YouTube's channel RSS surfaces their scheduled start time in
  // `published`. *Premieres* of a pre-uploaded video instead carry
  // the upload time in `published`, even when the video hasn't
  // aired yet, so this branch will miss them. Best-effort fallback
  // only — the watch-page scrape is the authoritative source.
  if (published.getTime() > Date.now()) {
    return { isScheduled: true, scheduledStartTime: published, source: 'transcriptApi' };
  }
  return { isScheduled: false, scheduledStartTime: null, source: 'transcriptApi' };
}

/**
 * Try the watch-page scrape first; fall back to TranscriptAPI's
 * `/channel/latest` when the scrape is unreachable or its HTML
 * carried no scheduled signal. Returns `{ source: 'none' }` when
 * both strategies came back empty — the caller should treat that
 * as "video is not scheduled" (the conservative default).
 *
 * `channelSourceId` is optional; pass the owning channel's UC id
 * when known so the TranscriptAPI fallback can fire. Without it,
 * only the scrape path runs.
 */
export async function detectScheduledVideo(
  videoId: string,
  options: { channelSourceId?: string | null } = {}
): Promise<ScheduledStatus> {
  const scrape = await detectViaWatchPage(videoId);
  if (scrape != null && scrape.isScheduled) {
    return scrape;
  }
  // Scrape was reachable and said "not scheduled" — trust it; no
  // need to spend a TranscriptAPI round-trip.
  if (scrape != null && !scrape.isScheduled) {
    return scrape;
  }
  // Scrape unreachable (null). Try TranscriptAPI if we have a
  // channel pointer to query against.
  const channelInput = options.channelSourceId ?? null;
  if (!isEmptyString(channelInput)) {
    const api = await detectViaTranscriptApi(videoId, channelInput);
    if (api != null) {
      return api;
    }
  }
  return { isScheduled: false, scheduledStartTime: null, source: 'none' };
}
