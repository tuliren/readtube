import type { TranscriptSegment } from '@/lib/platforms/types';

import { chunkTranscript } from '../chunkTranscript';

function seg(startMs: number, endMs: number, text: string): TranscriptSegment {
  return { startMs, endMs, text };
}

function makeWords(n: number): string {
  return Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
}

describe('chunkTranscript', () => {
  it('returns empty array for empty input', () => {
    expect(chunkTranscript([], { targetWords: 100, maxChunks: 10 })).toEqual([]);
  });

  it('returns one chunk for a single short segment', () => {
    const segments = [seg(0, 1000, 'hello world')];
    const chunks = chunkTranscript(segments, { targetWords: 100, maxChunks: 10 });
    expect(chunks).toEqual([{ index: 0, startMs: 0, endMs: 1000, text: 'hello world' }]);
  });

  it('returns one chunk when total words are below the target', () => {
    const segments = [
      seg(0, 1000, makeWords(50)),
      seg(1000, 2000, makeWords(40)),
      seg(2000, 3000, makeWords(5)),
    ];
    const chunks = chunkTranscript(segments, { targetWords: 200, maxChunks: 10 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ index: 0, startMs: 0, endMs: 3000 });
  });

  it('splits into multiple chunks when target is exceeded', () => {
    // 5 segments of 30 words each = 150 total. Target 50 forces a
    // cut as soon as a segment pushes the buffer over 50.
    const segments = Array.from({ length: 5 }, (_, i) =>
      seg(i * 1000, (i + 1) * 1000, makeWords(30))
    );
    const chunks = chunkTranscript(segments, { targetWords: 50, maxChunks: 10 });
    // Each segment alone is 30 words, two segments = 60 words ≥ 50,
    // so chunks group two segments each (last chunk may be one).
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.length).toBeLessThanOrEqual(5);
    // Indexes are sequential and start at 0.
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
    });
    // Chunks cover the whole timeline contiguously.
    expect(chunks[0].startMs).toBe(0);
    expect(chunks[chunks.length - 1].endMs).toBe(5000);
  });

  it('never splits a segment mid-text', () => {
    const segments = [seg(0, 1000, makeWords(50)), seg(1000, 2000, makeWords(60))];
    const chunks = chunkTranscript(segments, { targetWords: 30, maxChunks: 10 });
    // Even though target is well below either segment, neither gets
    // split — each output text is exactly one or more whole segments.
    for (const chunk of chunks) {
      // Reconstructable from whole segments → length = sum of constituent segment word counts.
      const wordCount = chunk.text.split(/\s+/).filter(Boolean).length;
      expect([50, 60, 110]).toContain(wordCount);
    }
  });

  it('respects maxChunks by merging tail segments into the last chunk', () => {
    // 10 segments of 100 words each. Target 50 would normally produce
    // ~10 chunks; cap at 3 forces the last chunk to absorb the
    // overflow.
    const segments = Array.from({ length: 10 }, (_, i) =>
      seg(i * 1000, (i + 1) * 1000, makeWords(100))
    );
    const chunks = chunkTranscript(segments, { targetWords: 50, maxChunks: 3 });
    expect(chunks).toHaveLength(3);
    // Last chunk ends at the last segment's endMs.
    expect(chunks[chunks.length - 1].endMs).toBe(10_000);
  });

  it('produces contiguous startMs/endMs across chunks', () => {
    const segments = Array.from({ length: 6 }, (_, i) =>
      seg(i * 1000, (i + 1) * 1000, makeWords(40))
    );
    const chunks = chunkTranscript(segments, { targetWords: 80, maxChunks: 10 });
    for (let i = 1; i < chunks.length; i++) {
      // Each chunk's start matches the previous chunk's end (next
      // segment's startMs == previous segment's endMs in test data).
      expect(chunks[i].startMs).toBe(chunks[i - 1].endMs);
    }
  });
});
