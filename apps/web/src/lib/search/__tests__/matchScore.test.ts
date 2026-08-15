import { bestMatchScore, matchScore, rankByMatchScore } from '@/lib/search/matchScore';

describe('matchScore', () => {
  it.each([
    ['exact match', 'Fireship', 'fireship', 100],
    ['exact match ignores case', 'Fireship', 'FIRESHIP', 100],
    ['exact match ignores surrounding whitespace in query', 'Fireship', '  fireship ', 100],
    ['prefix match', 'Fireship', 'fire', 50],
    ['word-boundary match', 'The Ship Show', 'ship', 30],
    ['word boundary after punctuation', 'Two-Minute Papers', 'minute', 30],
    ['mid-word substring', 'Fireship', 'ship', 10],
    ['no match', 'Fireship', 'veritasium', 0],
    ['empty query', 'Fireship', '', 0],
    ['whitespace-only query', 'Fireship', '   ', 0],
  ])('%s: %j vs %j scores %d', (_name, text, query, expected) => {
    expect(matchScore(text, query)).toBe(expected);
  });
});

describe('bestMatchScore', () => {
  it.each([
    ['picks the best candidate', ['Fireship', '@fireship'], 'fireship', 100],
    ['skips null and empty candidates', [null, undefined, '', 'Fireship'], 'fire', 50],
    ['returns 0 when nothing matches', ['Fireship', '@fireship'], 'mkbhd', 0],
    ['returns 0 for no candidates', [], 'fire', 0],
  ])('%s', (_name, texts, query, expected) => {
    expect(bestMatchScore(texts as Array<string | null | undefined>, query)).toBe(expected);
  });
});

describe('rankByMatchScore', () => {
  const channels = [
    { name: 'Rocketry Weekly', handle: null },
    { name: 'Fireship', handle: '@fireship' },
    { name: 'Fire Kitchen', handle: '@firekitchen' },
    { name: 'Campfire Stories', handle: null },
    { name: 'MKBHD', handle: '@mkbhd' },
  ];

  it('orders exact > prefix > word match and drops non-matches', () => {
    const ranked = rankByMatchScore(
      channels,
      'fire',
      (c) => [c.name, c.handle],
      (c) => c.name
    );
    expect(ranked.map((c) => c.name)).toEqual(['Fire Kitchen', 'Fireship', 'Campfire Stories']);
  });

  it('breaks score ties alphabetically', () => {
    const ranked = rankByMatchScore(
      [{ name: 'Beta Fire' }, { name: 'Alpha Fire' }],
      'fire',
      (c) => [c.name],
      (c) => c.name
    );
    expect(ranked.map((c) => c.name)).toEqual(['Alpha Fire', 'Beta Fire']);
  });

  it('returns empty for an empty query', () => {
    expect(
      rankByMatchScore(
        channels,
        '',
        (c) => [c.name],
        (c) => c.name
      )
    ).toEqual([]);
  });
});
