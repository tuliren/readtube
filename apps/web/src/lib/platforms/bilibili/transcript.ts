import { parseSrt } from '@/lib/platforms/bilibili/parseSrt';
import { SubtitleFetchError } from '@/lib/platforms/types';
import type { TranscriptSegment } from '@/lib/platforms/types';

import { fetchBilibiliTranscriptViaJustOneApi } from './justOneApi';
import { fetchKedouBilibiliSubtitle } from './kedouSubtitle';
import { buildBilibiliVideoUrl } from './urls';

/**
 * Fetch a transcript for a Bilibili video. Two-tier:
 *
 *   1. JustOneAPI (primary) — three signed round-trips (view → captions
 *      list → subtitle body). Covers AI-generated Chinese captions
 *      kedou sometimes misses and handles Bilibili's anti-bot noise
 *      on their own infra.
 *   2. Kedou proxy (fallback) — kedou.life scrapes Bilibili and
 *      returns SRT. Used when JustOneAPI is unreachable, out of
 *      quota, or returns no tracks for a video.
 *
 * Throws a SubtitleFetchError so `ensureTranscript` can distinguish
 * "this video has no captions" (sticky `transcript_unavailable`)
 * from "both providers are temporarily broken" (transient).
 */
export async function fetchBilibiliTranscript(
  bvid: string
): Promise<{ segments: TranscriptSegment[]; language: string }> {
  // Primary: JustOneAPI.
  try {
    return await fetchBilibiliTranscriptViaJustOneApi(bvid);
  } catch (justOneErr) {
    console.warn(
      `[bilibili/transcript] JustOneAPI failed for ${bvid}, trying kedou: ${
        justOneErr instanceof Error ? justOneErr.message : String(justOneErr)
      }`
    );
    // Fallback: kedou. If it ALSO fails, the thrown SubtitleFetchError's
    // `transient` flag reflects the combined state — permanent only
    // when kedou explicitly reports "no captions", because that's the
    // most reliable non-transient signal we have. JustOneAPI errors
    // alone stay transient so one-provider quota/outage doesn't flip
    // the sticky `transcript_unavailable` flag.
    try {
      return await fetchViaKedou(bvid);
    } catch (kedouErr) {
      const kedouPermanent = kedouErr instanceof SubtitleFetchError && !kedouErr.transient;
      const message = `JustOneAPI: ${justOneErr instanceof Error ? justOneErr.message : String(justOneErr)}; Kedou: ${kedouErr instanceof Error ? kedouErr.message : String(kedouErr)}`;
      throw new SubtitleFetchError(message, {
        transient: !kedouPermanent,
      });
    }
  }
}

/**
 * Kedou-only path. Kept as its own function so the primary+fallback
 * composition in fetchBilibiliTranscript stays readable and the
 * transient / permanent classification is explicit at the throw site.
 */
async function fetchViaKedou(
  bvid: string
): Promise<{ segments: TranscriptSegment[]; language: string }> {
  const url = buildBilibiliVideoUrl(bvid);

  let response;
  try {
    response = await fetchKedouBilibiliSubtitle(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown kedou error';
    throw new SubtitleFetchError(`Kedou request failed: ${message}`, { transient: true });
  }

  if (response.code !== 200 || response.data == null) {
    throw new SubtitleFetchError(`Kedou response error: ${response.message}`, {
      transient: true,
      status: response.code,
    });
  }

  const items = response.data.subtitleItemVoList;
  if (items == null || items.length === 0) {
    // Permanent: kedou explicitly says this video has no captions.
    // JustOneAPI already failed upstream by the time we reach here,
    // so this is our most reliable signal.
    throw new SubtitleFetchError('Bilibili video has no subtitles', {
      transient: false,
    });
  }

  // Prefer Chinese subtitles, falling back to the first available
  // track. Matches the existing `fetchBilibiliSubtitle` helper.
  const preferred = items.find((item) => item.lang === '中文') ?? items[0];
  const segments = parseSrt(preferred.content);
  if (segments.length === 0) {
    throw new SubtitleFetchError('Bilibili subtitle was empty after parsing', {
      transient: false,
    });
  }

  return { segments, language: preferred.lang };
}
