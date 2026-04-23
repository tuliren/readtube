import type { TranscriptParagraph } from '@/lib/platforms/youtube/transcript';
import {
  MAX_TRANSCRIPT_TOC_ITEMS,
  buildTranscriptToc,
  transcriptParagraphId,
} from '@/lib/reader/buildTranscriptToc';

function para(text: string, startMs: number, endMs: number): TranscriptParagraph {
  return { text, startMs, endMs };
}

describe('buildTranscriptToc', () => {
  it('returns empty array for no paragraphs', () => {
    expect(buildTranscriptToc([])).toEqual([]);
  });

  it('returns one item per paragraph when under the cap', () => {
    const paragraphs = [
      para('First paragraph here.', 0, 2000),
      para('Second paragraph here.', 3000, 6000),
      para('Third paragraph here.', 6000, 9000),
    ];
    const result = buildTranscriptToc(paragraphs);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual([
      transcriptParagraphId(0),
      transcriptParagraphId(1),
      transcriptParagraphId(2),
    ]);
  });

  it('caps output at MAX_TRANSCRIPT_TOC_ITEMS', () => {
    const paragraphs: TranscriptParagraph[] = [];
    for (let i = 0; i < 60; i++) {
      paragraphs.push(para(`paragraph ${i} text`, i * 10000, i * 10000 + 5000));
    }
    const result = buildTranscriptToc(paragraphs);
    expect(result).toHaveLength(MAX_TRANSCRIPT_TOC_ITEMS);
  });

  it('spreads picks roughly evenly across the paragraph list', () => {
    const paragraphs: TranscriptParagraph[] = [];
    for (let i = 0; i < 45; i++) {
      paragraphs.push(para(`p${i}`, i * 1000, i * 1000 + 500));
    }
    const result = buildTranscriptToc(paragraphs);
    expect(result).toHaveLength(MAX_TRANSCRIPT_TOC_ITEMS);
    // 45 / 15 = 3, so bucketed indices are 0, 3, 6, 9, ..., 42.
    const expectedIndices = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42];
    expect(result.map((r) => r.id)).toEqual(expectedIndices.map((i) => transcriptParagraphId(i)));
  });

  it('formats the label as a timestamp', () => {
    const paragraphs = [para('Hello world', 0, 1000), para('Later content', 65 * 1000, 70 * 1000)];
    const [first, second] = buildTranscriptToc(paragraphs);
    expect(first.label).toBe('0:00');
    expect(second.label).toBe('1:05');
  });

  it('returns the full paragraph when it fits in the preview cap', () => {
    const paragraphs = [para('Hello world', 0, 1000)];
    const [first] = buildTranscriptToc(paragraphs);
    expect(first.secondaryLabel).toBe('Hello world');
  });

  it('caps the preview at 50 words and preserves inline punctuation', () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`);
    const paragraphs = [para(`${words.join(', ')}.`, 0, 1000)];
    const [first] = buildTranscriptToc(paragraphs);
    const preview = first.secondaryLabel ?? '';
    // The split-on-word-char count is 50 — one "word" per wordN token.
    expect(preview.match(/word\d+/g)).toHaveLength(50);
    // Punctuation between the kept words comes along for the ride.
    expect(preview).toContain('word0, word1');
    // The trailing non-word characters from the dropped tail must not
    // leak into the preview.
    expect(preview.endsWith('.')).toBe(false);
  });

  it('uses Intl.Segmenter-style word boundaries for CJK text', () => {
    // 10 ideographs — well under the 50-word cap, so the entire
    // paragraph rides through unchanged.
    const paragraphs = [para('你好世界这是一段话呀', 0, 1000)];
    const [first] = buildTranscriptToc(paragraphs);
    expect(first.secondaryLabel).toBe('你好世界这是一段话呀');
  });

  it('trims leading whitespace before picking the preview', () => {
    const paragraphs = [para('   Hi there everyone', 0, 1000)];
    const [first] = buildTranscriptToc(paragraphs);
    expect(first.secondaryLabel).toBe('Hi there everyone');
  });
});
