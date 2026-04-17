/**
 * Count the number of words in a string.
 *
 * Uses `Intl.Segmenter` with `granularity: 'word'` so the count is
 * meaningful for CJK languages (Chinese, Japanese, Korean) where
 * there are no whitespace boundaries between words. The browser /
 * Node runtime returns segment boundaries that line up with what a
 * native speaker would call a "word", and we count only the
 * `isWordLike` segments — punctuation, whitespace, and Markdown
 * syntax characters (`-`, `*`, `#`) are filtered out automatically.
 *
 * Falls back to a simple `\s+` split for environments without
 * `Intl.Segmenter` (older Node, ancient browsers). The fallback only
 * works for whitespace-delimited languages, which matches the
 * pre-Intl status quo.
 *
 * Returns 0 for null / undefined / empty input so callers can render
 * "(0 words)" without a special case.
 */
export function countWords(text: string | null | undefined): number {
  if (text == null) {
    return 0;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    // Array.from instead of `for...of` so this compiles cleanly
    // against the workspace tsconfig (target es5, no
    // downlevelIteration). Intl.Segmenter's `segment()` result is
    // an iterable, which Array.from happily consumes.
    return Array.from(segmenter.segment(trimmed)).filter((segment) => segment.isWordLike).length;
  }
  return trimmed.split(/\s+/).filter((token) => token.length > 0).length;
}

// A middle-of-the-road adult silent-reading rate. Faster than the
// traditional 200 wpm (which assumes careful reading) and slower than
// 250 wpm (which assumes heavy skimming) — appropriate for the mix of
// summary, article, and transcript content this app renders.
export const READING_WPM = 230;

export function readingTimeMinutes(wordCount: number): number {
  if (wordCount <= 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(wordCount / READING_WPM));
}

export function formatReadingTime(wordCount: number): string | null {
  const minutes = readingTimeMinutes(wordCount);
  if (minutes <= 0) {
    return null;
  }
  return `${minutes} min`;
}
