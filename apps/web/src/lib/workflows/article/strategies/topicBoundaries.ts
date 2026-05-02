import {
  MAX_SECTIONS,
  MAX_SECTION_WORDS,
  MIN_SECTION_WORDS,
  TOPIC_BOUNDARY_DISTANCE,
} from '@/constants';

import type { TranscriptChunk } from './chunkTranscript';
import { cosineDistance } from './embedWindows';

export interface TopicSection {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  /** Indices into the input `windows` array that this section spans. */
  windowRange: { start: number; end: number };
}

/**
 * Greedy walk over windows: accumulate into a section until either
 * (a) the section has enough words to be substantive AND the next
 * window-pair distance exceeds {@link TOPIC_BOUNDARY_DISTANCE}, or
 * (b) the section has hit {@link MAX_SECTION_WORDS}. Hitting
 * {@link MAX_SECTIONS} merges remaining tail windows into the last
 * section so the cap is honoured.
 *
 * Bounds each section into [{@link MIN_SECTION_WORDS}, {@link MAX_SECTION_WORDS}]
 * range while letting natural topic shifts shape variable-length cuts.
 */
export function groupWindowsIntoSections(
  windows: TranscriptChunk[],
  embeddings: number[][]
): TopicSection[] {
  if (windows.length === 0) {
    return [];
  }
  if (windows.length !== embeddings.length) {
    throw new Error(
      `windows.length (${windows.length}) !== embeddings.length (${embeddings.length})`
    );
  }

  // Pairwise distances at boundaries: distances[i] = distance between
  // windows[i] and windows[i+1]. So distances has length N-1.
  const distances: number[] = [];
  for (let i = 0; i < windows.length - 1; i++) {
    distances.push(cosineDistance(embeddings[i], embeddings[i + 1]));
  }

  const sections: TopicSection[] = [];
  let bufStart = 0;
  let bufWords = 0;

  const flush = (endIndex: number) => {
    const sliced = windows.slice(bufStart, endIndex + 1);
    const text = sliced.map((w) => w.text).join(' ');
    sections.push({
      index: sections.length,
      startMs: sliced[0].startMs,
      endMs: sliced[sliced.length - 1].endMs,
      text,
      windowRange: { start: bufStart, end: endIndex },
    });
    bufStart = endIndex + 1;
    bufWords = 0;
  };

  for (let i = 0; i < windows.length; i++) {
    bufWords += countWords(windows[i].text);
    const isLast = i === windows.length - 1;

    if (isLast) {
      flush(i);
      break;
    }

    const distToNext = distances[i];
    const reachedMax = bufWords >= MAX_SECTION_WORDS;
    const topicShift = bufWords >= MIN_SECTION_WORDS && distToNext >= TOPIC_BOUNDARY_DISTANCE;

    if ((reachedMax || topicShift) && sections.length < MAX_SECTIONS - 1) {
      flush(i);
    }
  }

  return sections;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}
