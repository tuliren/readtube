import { countWords } from '@/lib/format/wordCount';
import type { TranscriptSegment } from '@/lib/platforms/types';

export interface TranscriptChunk {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface ChunkOptions {
  /** Target word count per chunk. Hard cuts snap to segment boundaries. */
  targetWords: number;
  /** Hard cap on number of chunks emitted. Beyond this, remaining segments
   *  are merged into the last chunk so we never exceed the cap. */
  maxChunks: number;
}

/**
 * Slice transcript segments into ordered chunks of roughly
 * `targetWords` words each, never splitting a segment mid-text. The
 * algorithm walks segments in order and emits a chunk as soon as the
 * accumulated word count crosses the target, so the *last* segment in
 * a chunk is the first one that pushes it over — actual chunk sizes
 * vary ±20% with target=2000 in practice.
 *
 * Pure function: no I/O, no LLM, no global state.
 */
export function chunkTranscript(
  segments: TranscriptSegment[],
  { targetWords, maxChunks }: ChunkOptions
): TranscriptChunk[] {
  if (segments.length === 0) {
    return [];
  }

  const chunks: TranscriptChunk[] = [];
  let bufSegments: TranscriptSegment[] = [];
  let bufWords = 0;

  const flush = () => {
    if (bufSegments.length === 0) {
      return;
    }
    const startMs = bufSegments[0].startMs;
    const endMs = bufSegments[bufSegments.length - 1].endMs;
    const text = bufSegments.map((s) => s.text).join(' ');
    chunks.push({ index: chunks.length, startMs, endMs, text });
    bufSegments = [];
    bufWords = 0;
  };

  for (const seg of segments) {
    bufSegments.push(seg);
    bufWords += countWords(seg.text);
    if (bufWords >= targetWords) {
      // Emit only if we still have capacity for more chunks. If we're
      // at maxChunks - 1 and there are more segments coming, fall
      // through and let the trailing segments accumulate into the
      // final chunk so the cap is honoured.
      if (chunks.length < maxChunks - 1) {
        flush();
      }
    }
  }

  flush();
  return chunks;
}
