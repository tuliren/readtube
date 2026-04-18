import type { TranscriptSegment } from '@/lib/platforms/types';

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name: string;
  /** "asr" = auto-generated; absent = manual */
  kind?: string;
}

/** Internal shape of a timed-text event returned by YouTube's timedtext endpoint. */
export interface CaptionEvent {
  tStartMs: number;
  dDurationMs?: number;
  segs?: { utf8: string }[];
}

export interface SubtitleResult {
  videoId: string;
  title: string;
  channel: string;
  language: string;
  languageName: string;
  captionType: 'manual' | 'auto-generated';
  segmentCount: number;
  segments: TranscriptSegment[];
}
