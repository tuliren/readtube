import type { TocItem } from '@/components/reader/FloatingToc';
import type { TranscriptParagraph } from '@/lib/platforms/youtube/transcript';
import { formatTimestamp } from '@/lib/platforms/youtube/transcript';

/** At-most TOC entries for a transcript — the Notion-style ladder gets
 *  too dense past this count and the popup turns into a wall of
 *  timestamps that defeats the "scan the video" purpose. */
export const MAX_TRANSCRIPT_TOC_ITEMS = 15;

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
    // Advance by code points so multi-byte characters (emoji, CJK
    // ideographs) count as a single character each. Array.from works
    // on the downlevel es5 target where `[...string]` doesn't compile.
    const chars = Array.from(para.text.trim());
    items.push({
      id: transcriptParagraphId(idx),
      label: formatTimestamp(para.startMs),
      secondaryLabel: chars.slice(0, 3).join(''),
    });
  }
  return items;
}
