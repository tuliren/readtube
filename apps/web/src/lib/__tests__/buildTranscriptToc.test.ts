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

  it('uses the first three characters of the paragraph as secondaryLabel', () => {
    const paragraphs = [para('Hello world', 0, 1000), para('你好世界吗', 2000, 4000)];
    const [first, second] = buildTranscriptToc(paragraphs);
    expect(first.secondaryLabel).toBe('Hel');
    expect(second.secondaryLabel).toBe('你好世');
  });

  it('trims leading whitespace before picking the preview', () => {
    const paragraphs = [para('   Hi there everyone', 0, 1000)];
    const [first] = buildTranscriptToc(paragraphs);
    expect(first.secondaryLabel).toBe('Hi ');
  });
});
