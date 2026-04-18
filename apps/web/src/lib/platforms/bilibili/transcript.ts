import { parseSrt } from '@/lib/platforms/bilibili/parseSrt';
import { SubtitleFetchError } from '@/lib/platforms/types';
import type { TranscriptSegment } from '@/lib/platforms/types';

import { fetchKedouBilibiliSubtitle } from './kedouSubtitle';
import { buildBilibiliVideoUrl } from './urls';

/**
 * Fetch a transcript for a Bilibili video via the kedou.life proxy and
 * convert its SRT body into transcript segments. Throws a
 * SubtitleFetchError so `ensureTranscript` can distinguish "no
 * captions" (sticky) from "kedou is down" (transient).
 */
export async function fetchBilibiliTranscript(
  bvid: string
): Promise<{ segments: TranscriptSegment[]; language: string }> {
  const url = buildBilibiliVideoUrl(bvid);

  let response;
  try {
    response = await fetchKedouBilibiliSubtitle(url);
  } catch (err) {
    // Network / kedou-encryption failure. Treat as transient so the
    // sticky transcript_unavailable flag isn't set on a kedou outage.
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
    throw new SubtitleFetchError('Bilibili video has no subtitles', {
      transient: false,
    });
  }

  // Prefer Chinese subtitles, falling back to the first available
  // track. This matches the existing `fetchBilibiliSubtitle` helper
  // in the repo.
  const preferred = items.find((item) => item.lang === '中文') ?? items[0];
  const segments = parseSrt(preferred.content);
  if (segments.length === 0) {
    throw new SubtitleFetchError('Bilibili subtitle was empty after parsing', {
      transient: false,
    });
  }

  return { segments, language: preferred.lang };
}
