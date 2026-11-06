import { capPerKey, pickHeadline } from '@/lib/onboarding/suggestions';

// The real detector pulls in ESM-only franc, which ts-jest can't load.
jest.mock('@/lib/language/detect', () => ({ detectLanguage: jest.fn() }));

describe('capPerKey', () => {
  it.each([
    {
      name: 'keeps the first items per key in order',
      keys: ['a', 'a', 'b', 'a', 'b', 'b', 'c'],
      max: 2,
      expected: [0, 1, 2, 4, 6],
    },
    { name: 'keeps everything under the cap', keys: ['a', 'b'], max: 2, expected: [0, 1] },
    { name: 'handles an empty list', keys: [], max: 2, expected: [] },
  ])('$name', ({ keys, max, expected }) => {
    const items = keys.map((key, index) => ({ key, index }));
    expect(capPerKey(items, (i) => i.key, max).map((i) => i.index)).toEqual(expected);
  });
});

describe('pickHeadline', () => {
  it.each([
    {
      name: 'the Original over English',
      summaries: [
        { headline: 'English', language: 'en' },
        { headline: 'Original', language: null },
      ],
      expected: 'Original',
    },
    {
      name: 'English over other translations',
      summaries: [
        { headline: 'French', language: 'fr' },
        { headline: 'English', language: 'en' },
      ],
      expected: 'English',
    },
    {
      name: 'any translation as a last resort',
      summaries: [{ headline: 'French', language: 'fr' }],
      expected: 'French',
    },
    {
      name: 'a usable headline over a blank Original',
      summaries: [
        { headline: '  ', language: null },
        { headline: 'English', language: 'en' },
      ],
      expected: 'English',
    },
    { name: 'null with no summaries', summaries: [], expected: null },
    {
      name: 'null when every headline is missing',
      summaries: [{ headline: null, language: null }],
      expected: null,
    },
  ])('picks $name', ({ summaries, expected }) => {
    expect(pickHeadline(summaries)).toBe(expected);
  });
});
