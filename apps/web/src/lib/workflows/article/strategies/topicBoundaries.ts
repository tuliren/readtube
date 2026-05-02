import {
  MAX_SECTIONS,
  MAX_SECTION_WORDS,
  MIN_SECTION_WORDS,
  SECTION_TARGET_WORDS,
  TOPIC_BOUNDARY_DISTANCE,
} from '@/constants';

import type { TranscriptChunk } from './chunkTranscript';
import { cosineDistance } from './embedWindows';

export type CutReason = 'topic-shift' | 'max-words' | 'last' | 'fallback';

export interface TopicSection {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  /** Indices into the input `windows` array that this section spans. */
  windowRange: { start: number; end: number };
  /** Why the boundary at this section's end was placed where it was.
   *  Surfaced so the workflow can log a tuning-friendly summary. */
  cutReason: CutReason;
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
 *
 * Emits a single `console.info` summary line that explains exactly how
 * the section count was reached — total words, distance stats, and a
 * per-section breakdown with each cut's reason. Tuning the
 * SECTION_TARGET_WORDS / TOPIC_BOUNDARY_DISTANCE knobs reads off this
 * log without instrumenting separately.
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

  const flush = (endIndex: number, reason: CutReason) => {
    const sliced = windows.slice(bufStart, endIndex + 1);
    const text = sliced.map((w) => w.text).join(' ');
    sections.push({
      index: sections.length,
      startMs: sliced[0].startMs,
      endMs: sliced[sliced.length - 1].endMs,
      text,
      windowRange: { start: bufStart, end: endIndex },
      cutReason: reason,
    });
    bufStart = endIndex + 1;
    bufWords = 0;
  };

  for (let i = 0; i < windows.length; i++) {
    bufWords += countWords(windows[i].text);
    const isLast = i === windows.length - 1;

    if (isLast) {
      flush(i, 'last');
      break;
    }

    const distToNext = distances[i];
    const reachedMax = bufWords >= MAX_SECTION_WORDS;
    const topicShift = bufWords >= MIN_SECTION_WORDS && distToNext >= TOPIC_BOUNDARY_DISTANCE;

    if ((reachedMax || topicShift) && sections.length < MAX_SECTIONS - 1) {
      flush(i, reachedMax ? 'max-words' : 'topic-shift');
    }
  }

  logGroupingSummary(windows, distances, sections);
  return sections;
}

function logGroupingSummary(
  windows: TranscriptChunk[],
  distances: number[],
  sections: TopicSection[]
): void {
  const totalWords = windows.reduce((acc, w) => acc + countWords(w.text), 0);
  const cutCounts: Record<CutReason, number> = {
    'topic-shift': 0,
    'max-words': 0,
    last: 0,
    fallback: 0,
  };
  for (const s of sections) {
    cutCounts[s.cutReason]++;
  }

  const distanceStats =
    distances.length > 0
      ? {
          min: round(Math.min(...distances)),
          max: round(Math.max(...distances)),
          mean: round(distances.reduce((a, b) => a + b, 0) / distances.length),
          threshold: TOPIC_BOUNDARY_DISTANCE,
        }
      : null;

  const perSection = sections.map((s) => ({
    idx: s.index,
    windows: `${s.windowRange.start}..${s.windowRange.end}`,
    words: countWords(s.text),
    reason: s.cutReason,
    // Distance to the window AFTER this section's last window. Null for
    // the final section (no "next" window).
    distAtCut: s.windowRange.end < distances.length ? round(distances[s.windowRange.end]) : null,
  }));

  console.info('[articleWorkflow:map-reduce] section grouping summary', {
    windows: windows.length,
    totalWords,
    sections: sections.length,
    bounds: {
      target: SECTION_TARGET_WORDS,
      min: MIN_SECTION_WORDS,
      max: MAX_SECTION_WORDS,
    },
    distances: distanceStats,
    cutReasons: cutCounts,
    perSection,
  });
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}
