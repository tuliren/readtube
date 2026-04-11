import { isEmptyString } from '@/lib/string';

import type { TranscriptSegment } from './types';

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

export async function fetchSubtitleViaTranscriptApi(
  videoId: string
): Promise<{ segments: TranscriptSegment[]; language: string }> {
  const apiKey = process.env.TRANSCRIPT_API_KEY;
  if (isEmptyString(apiKey)) {
    throw new Error('TRANSCRIPT_API_KEY is not set');
  }

  const url = `https://transcriptapi.com/api/v2/youtube/transcript?video_url=${videoId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TranscriptAPI error ${res.status}: ${body}`);
  }

  const data: TranscriptApiResponse = await res.json();

  const segments: TranscriptSegment[] = data.transcript.map((seg) => ({
    startMs: Math.round(seg.start * 1000),
    endMs: Math.round((seg.start + seg.duration) * 1000),
    text: seg.text,
  }));

  return { segments, language: data.language };
}
