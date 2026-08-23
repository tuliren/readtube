/**
 * Duration-only lookup for a single YouTube video. Used by the
 * transcript generation route to backfill `Video.duration_seconds` on
 * demand: videos ingested through duration-less paths (playlist RSS,
 * the TranscriptAPI metadata fallback) would otherwise be permanently
 * locked out of AI transcription, because generation windows cannot be
 * planned without a duration and the channel-refresh cron only
 * backfills videos still in the channel's recent feed.
 *
 * Strategy mirrors videoSnapshot.ts at a fraction of the cost:
 *   0. Data API `videos.list part=contentDetails` (1 quota unit).
 *   1. Watch-page scrape — duration microdata or the player response's
 *      `lengthSeconds`.
 *
 * Best-effort by design: every failure returns null rather than
 * throwing, and the caller decides how to surface "still unknown".
 */
import { fetchVideoDurationViaDataApi, isDataApiConfigured } from './dataApi';
import { parseIsoDurationSeconds } from './isoDuration';

const YT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Pull the duration out of a watch-page HTML document. Two sources,
 * tried in order:
 *   - the `itemprop="duration"` meta microdata (ISO-8601, PT#H#M#S);
 *   - the player response's `"lengthSeconds":"…"` field, which
 *     survives the consent-wall page variants that omit the microdata.
 */
export function extractDurationSecondsFromWatchHtml(html: string): number | null {
  const iso = html.match(/<meta itemprop="duration" content="([^"]+)"/);
  const fromMicrodata = parseIsoDurationSeconds(iso?.[1]);
  if (fromMicrodata != null) {
    return fromMicrodata;
  }
  const lengthSeconds = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
  if (lengthSeconds == null) {
    return null;
  }
  const parsed = parseInt(lengthSeconds[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Fetch a video's duration in seconds, or null when no source can
 * produce one (video removed, both sources unreachable, livestream
 * without a fixed length).
 */
export async function fetchVideoDurationSeconds(videoId: string): Promise<number | null> {
  if (isDataApiConfigured()) {
    try {
      const duration = await fetchVideoDurationViaDataApi(videoId);
      if (duration != null) {
        return duration;
      }
      console.warn(`[videoDuration] Data API returned no duration for ${videoId}`);
    } catch (err) {
      console.warn(`[videoDuration] Data API duration lookup failed for ${videoId}:`, err);
    }
  }

  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': YT_USER_AGENT },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn(`[videoDuration] watch page returned ${res.status} for ${videoId}`);
      return null;
    }
    return extractDurationSecondsFromWatchHtml(await res.text());
  } catch (err) {
    console.warn(`[videoDuration] watch page fetch failed for ${videoId}:`, err);
    return null;
  }
}
