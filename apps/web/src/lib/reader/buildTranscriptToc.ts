import type { TocItem } from '@/components/reader/FloatingToc';
import type { TranscriptParagraph } from '@/lib/platforms/youtube/transcript';
import { formatTimestamp } from '@/lib/platforms/youtube/transcript';

/** At-most TOC entries for a transcript — the Notion-style ladder gets
 *  too dense past this count and the popup turns into a wall of
 *  timestamps that defeats the "scan the video" purpose. */
export const MAX_TRANSCRIPT_TOC_ITEMS = 15;

/** Upper bound on how much of a paragraph we ship to the popup preview.
 *  The popup visually truncates with an ellipsis based on width, so
 *  this only caps the payload — enough words that the ellipsis always
 *  has something to hide behind, few enough that CJK paragraphs don't
 *  balloon the client-side item list. */
const PREVIEW_WORD_LIMIT = 50;

/** Stable DOM id for the Nth transcript paragraph. The paragraph list
 *  is the anchor surface; TOC entries reference a subset of these. */
export function transcriptParagraphId(index: number): string {
  return `toc-ts-${index}`;
}

/**
 * Picks up to `MAX_TRANSCRIPT_TOC_ITEMS` paragraphs evenly distributed
 * across the transcript so the TOC roughly divides the video into 15
 * segments. Each entry carries the paragraph's starting timestamp plus
 * the first three characters of its text for the hover popup.
 *
 * Short transcripts (fewer paragraphs than the cap) render one TOC
 * entry per paragraph — no point skipping any when everything fits.
 */
export function buildTranscriptToc(paragraphs: TranscriptParagraph[]): TocItem[] {
  if (paragraphs.length === 0) {
    return [];
  }
  const count = Math.min(MAX_TRANSCRIPT_TOC_ITEMS, paragraphs.length);
  const bucketSize = paragraphs.length / count;
  const items: TocItem[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(i * bucketSize);
    const para = paragraphs[idx];
    items.push({
      id: transcriptParagraphId(idx),
      label: formatTimestamp(para.startMs),
      secondaryLabel: takeFirstWords(para.text, PREVIEW_WORD_LIMIT),
    });
  }
  return items;
}

/**
 * Returns the original text truncated to the first `maxWords` word-like
 * tokens. Uses `Intl.Segmenter` when available so CJK languages (which
 * lack whitespace boundaries) yield something sensible — one word per
 * ideograph-segment — instead of the entire paragraph or a single
 * useless "word". Falls back to a whitespace split otherwise.
 *
 * Preserves the punctuation and spacing around the words it keeps so
 * the preview reads naturally: "Hello, world" stays "Hello, world", not
 * "Hello world".
 */
function takeFirstWords(text: string, maxWords: number): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return '';
  }
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') {
    return trimmed
      .split(/\s+/)
      .filter((token) => token.length > 0)
      .slice(0, maxWords)
      .join(' ');
  }
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  let wordCount = 0;
  let endIndex = 0;
  const segments = Array.from(segmenter.segment(trimmed));
  for (const segment of segments) {
    if (segment.isWordLike) {
      if (wordCount >= maxWords) {
        break;
      }
      wordCount += 1;
    }
    endIndex = segment.index + segment.segment.length;
  }
  return trimmed.slice(0, endIndex).trimEnd();
}
