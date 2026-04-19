import { parseSrt } from '@/lib/platforms/bilibili/parseSrt';
import { SubtitleFetchError } from '@/lib/platforms/types';
import type { TranscriptSegment } from '@/lib/platforms/types';

import { fetchBilibiliTranscriptViaJustOneApi } from './justOneApi';
import { fetchKedouBilibiliSubtitle } from './kedouSubtitle';
import { buildBilibiliVideoUrl } from './urls';

export async function fetchBilibiliTranscript(
  bvid: string
): Promise<{ segments: TranscriptSegment[]; language: string }> {
  try {
    return await fetchBilibiliTranscriptViaJustOneApi(bvid);
  } catch (justOneErr) {
    try {
      return await fetchViaKedou(bvid);
    } catch (kedouErr) {
      const kedouPermanent = kedouErr instanceof SubtitleFetchError && !kedouErr.transient;
      const message = `JustOneAPI: ${justOneErr instanceof Error ? justOneErr.message : String(justOneErr)}; Kedou: ${kedouErr instanceof Error ? kedouErr.message : String(kedouErr)}`;
      throw new SubtitleFetchError(message, { transient: !kedouPermanent });
    }
  }
}

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
    throw new SubtitleFetchError('Bilibili video has no subtitles', { transient: false });
  }

  const preferred = items.find((item) => item.lang === '中文') ?? items[0];
  const segments = parseSrt(preferred.content);
  if (segments.length === 0) {
    throw new SubtitleFetchError('Bilibili subtitle was empty after parsing', { transient: false });
  }

  return { segments, language: preferred.lang };
}
