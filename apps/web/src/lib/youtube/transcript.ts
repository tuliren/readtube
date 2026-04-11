import type { TranscriptSegment } from '@/lib/subtitles/types';

export interface TranscriptParagraph {
  text: string;
  startMs: number;
  endMs: number;
}

const FILLER_PATTERNS = [/^\[music\]$/i, /^\[applause\]$/i, /^\[laughter\]$/i, /^\[silence\]$/i];

const PAUSE_THRESHOLD_MS = 2000;
const MAX_SEGMENTS_PER_PARAGRAPH = 7;

function isFiller(text: string): boolean {
  const trimmed = text.trim();
  return FILLER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function capitalize(text: string): string {
  if (!text) {
    return text;
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Groups raw transcript segments into readable paragraphs.
 *
 * A new paragraph starts when:
 * - The gap between segments exceeds PAUSE_THRESHOLD_MS, or
 * - MAX_SEGMENTS_PER_PARAGRAPH segments have accumulated.
 *
 * Filler segments ([Music], [Applause], etc.) are dropped.
 */
export function groupTranscriptSegments(segments: TranscriptSegment[]): TranscriptParagraph[] {
  const filtered = segments.filter((s) => !isFiller(s.text));
  if (filtered.length === 0) {
    return [];
  }

  const paragraphs: TranscriptParagraph[] = [];
  let currentSegments: TranscriptSegment[] = [];

  for (let i = 0; i < filtered.length; i++) {
    const segment = filtered[i];
    const prev = filtered[i - 1];

    const pauseBreak = prev !== undefined && segment.startMs - prev.endMs > PAUSE_THRESHOLD_MS;
    const lengthBreak = currentSegments.length >= MAX_SEGMENTS_PER_PARAGRAPH;

    if ((pauseBreak || lengthBreak) && currentSegments.length > 0) {
      paragraphs.push(buildParagraph(currentSegments));
      currentSegments = [];
    }

    currentSegments.push(segment);
  }

  if (currentSegments.length > 0) {
    paragraphs.push(buildParagraph(currentSegments));
  }

  return paragraphs;
}

function buildParagraph(segments: TranscriptSegment[]): TranscriptParagraph {
  const text = capitalize(segments.map((s) => s.text.trim()).join(' '));
  return {
    text,
    startMs: segments[0].startMs,
    endMs: segments[segments.length - 1].endMs,
  };
}

export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
