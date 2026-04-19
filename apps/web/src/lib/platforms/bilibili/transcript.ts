import { parseSrt } from '@/lib/platforms/bilibili/parseSrt';
import { SubtitleFetchError } from '@/lib/platforms/types';
import type { TranscriptSegment } from '@/lib/platforms/types';

import { fetchBilibiliTranscriptViaJustOneApi } from './justOneApi';
import { fetchKedouBilibiliSubtitle } from './kedouSubtitle';
import { buildBilibiliVideoUrl } from './urls';

/**
 * Fetch a transcript for a Bilibili video, with JustOneAPI as a
 * fallback for kedou. Two-tier:
 *
 *   1. Kedou proxy (primary) — kedou.life scrapes Bilibili and returns
 *      SRT. Fast when it works, but occasionally down, encryption-
 *      protocol-mismatched, or lacking AI-generated Chinese captions.
 *   2. JustOneAPI (fallback) — signed caption URLs from
 *      `get-video-caption/v2`, three round-trips, covers AI-generated
 *      tracks kedou may miss.
 *
 * Throws a SubtitleFetchError so `ensureTranscript` can distinguish
 * "this video has no captions" (sticky `transcript_unavailable`)
 * from "both providers are temporarily broken" (transient).
 */
export async function fetchBilibiliTranscript(
  bvid: string
): Promise<{ segments: TranscriptSegment[]; language: string }> {
  // Primary: kedou.
  try {
    const result = await fetchViaKedou(bvid);
    return result;
  } catch (kedouErr) {
    console.warn(
      `[bilibili/transcript] kedou failed for ${bvid}, trying JustOneAPI: ${
        kedouErr instanceof Error ? kedouErr.message : String(kedouErr)
      }`
    );
    // Fallback: JustOneAPI. If this also fails, throw an error whose
    // transient flag reflects the combined state — if BOTH providers
    // explicitly report "no captions", call it permanent. Otherwise
    // treat it as transient so we don't flip the sticky unavailable
    // flag on a one-provider hiccup.
    try {
      return await fetchBilibiliTranscriptViaJustOneApi(bvid);
    } catch (justOneErr) {
      const kedouPermanent = kedouErr instanceof SubtitleFetchError && !kedouErr.transient;
      const message = `Kedou: ${kedouErr instanceof Error ? kedouErr.message : String(kedouErr)}; JustOneAPI: ${justOneErr instanceof Error ? justOneErr.message : String(justOneErr)}`;
      throw new SubtitleFetchError(message, {
        transient: !kedouPermanent,
      });
    }
  }
}

/**
 * Kedou-only path, extracted so the primary+fallback composition in
 * fetchBilibiliTranscript stays readable. Preserves the original
 * transient / permanent classification so the fallback orchestrator
 * can reason about which side actually failed.
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
    // The JustOneAPI fallback may still find AI-generated ones, but
    // that decision belongs to the orchestrator above.
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
