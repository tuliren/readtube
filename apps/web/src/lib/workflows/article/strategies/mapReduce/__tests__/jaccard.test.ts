import { jaccardSimilarity } from '../jaccard';

describe('jaccardSimilarity', () => {
  it.each([
    ['', '', 1],
    ['', 'something', 0],
    ['something', '', 0],
  ])('treats empty inputs as expected: a=%j, b=%j -> %p', (a, b, expected) => {
    expect(jaccardSimilarity(a, b)).toBe(expected);
  });

  it.each([
    ['Roman empire', 'Roman empire', 1],
    ['Roman Empire', 'roman empire', 1],
    ['Roman empire!', 'Roman, empire.', 1],
  ])('returns 1 for token-equal labels: %j vs %j', (a, b) => {
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  it.each([
    ['Roman empire', 'Persian wars', 0],
    ['climate change', 'database normalization', 0],
  ])('returns 0 for disjoint token sets: %j vs %j', (a, b) => {
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('returns >0.6 for near-duplicate adjacent headings (dedup triggers)', () => {
    // "Roman empire" (2 tokens) vs "Roman empire history" (3 tokens):
    // intersection 2, union 3, Jaccard 2/3 ≈ 0.67 → dedup.
    expect(jaccardSimilarity('Roman empire', 'Roman empire history')).toBeGreaterThan(0.6);
  });

  it('returns ≤0.5 for partially overlapping but distinct headings', () => {
    // "Roman empire history" vs "Roman empire details": both 3 tokens
    // sharing 2 — Jaccard 2/4 = 0.5. They ARE different topics; the
    // 0.6 threshold correctly keeps both headings.
    expect(jaccardSimilarity('Roman empire history', 'Roman empire details')).toBeLessThanOrEqual(
      0.5
    );
    // "Founding of Rome" vs "Founding of Athens": 2/4 = 0.5 — kept.
    expect(jaccardSimilarity('Founding of Rome', 'Founding of Athens')).toBeLessThanOrEqual(0.5);
  });
});
