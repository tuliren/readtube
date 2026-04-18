import { SubtitleFetchError, type TranscriptSegment } from '@/lib/platforms/types';
import { isEmptyString } from '@/lib/string';

interface TranscriptApiSegment {
  text: string;
  start: number;
  duration: number;
}

interface TranscriptApiResponse {
  video_id: string;
  language: string;
  transcript: TranscriptApiSegment[];
}

/**
 * Decide whether a given upstream HTTP status should be treated as
 * a transient blip (worth retrying later) or a permanent "this
 * video has no captions" answer.
 *
 * Permanent: 404 (no record), 410 (gone), 422 (unprocessable —
 * upstream's signal for "no captions track"). Anything else in 4xx
 * is conservatively treated as transient because it might be auth /
 * configuration / quota that the operator can fix.
 *
 * Transient: 429 (rate limit), 5xx (server error), and the
 * conservative 4xx fallback.
 *
 * Exported for testing.
 */
export function isPermanentTranscriptStatus(status: number): boolean {
  return status === 404 || status === 410 || status === 422;
}

export async function fetchSubtitleViaTranscriptApi(
  videoId: string
): Promise<{ segments: TranscriptSegment[]; language: string }> {
  const apiKey = process.env.TRANSCRIPT_API_KEY;
  if (isEmptyString(apiKey)) {
    // A missing API key is a config bug — the next deploy will fix
    // it. Treat it as transient so we don't sticky-flag every video
    // a user opens during a misconfiguration window.
    throw new SubtitleFetchError('TRANSCRIPT_API_KEY is not set', { transient: true });
  }

  console.info(`[TranscriptAPI] Fetching transcript for video ${videoId}`);

  const url = `https://transcriptapi.com/api/v2/youtube/transcript?video_url=${videoId}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (err) {
    // Fetch threw before getting a response — DNS, network, abort,
    // etc. All transient by definition.
    const message = err instanceof Error ? err.message : 'Unknown network error';
    console.error(`[TranscriptAPI] Network error for video ${videoId}:`, message);
    throw new SubtitleFetchError(`TranscriptAPI network error: ${message}`, { transient: true });
  }

  if (!res.ok) {
    const body = await res.text();
    const transient = !isPermanentTranscriptStatus(res.status);
    console.error(`[TranscriptAPI] Error for video ${videoId}: ${res.status} ${body}`);
    throw new SubtitleFetchError(`TranscriptAPI error ${res.status}: ${body}`, {
      transient,
      status: res.status,
    });
  }

  const data: TranscriptApiResponse = await res.json();

  const segments: TranscriptSegment[] = data.transcript.map((seg) => ({
    startMs: Math.round(seg.start * 1000),
    endMs: Math.round((seg.start + seg.duration) * 1000),
    text: seg.text,
  }));

  return { segments, language: data.language };
}
