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
      name: 'the Original over a same-language translation',
      summaries: [
        { headline: 'Translated', language: 'en-GB' },
        { headline: 'Original', language: null },
      ],
      language: 'en',
      expected: 'Original',
    },
    {
      name: 'a translation in the card language without an Original',
      summaries: [
        { headline: 'French', language: 'fr' },
        { headline: 'Chinese', language: 'zh-Hans' },
      ],
      language: 'zh',
      expected: 'Chinese',
    },
    {
      name: 'nothing when only other languages exist',
      summaries: [
        { headline: 'English', language: 'en' },
        { headline: 'French', language: 'fr' },
      ],
      language: 'pl',
      expected: null,
    },
    {
      name: 'the Original when the card language is unknown',
      summaries: [
        { headline: 'English', language: 'en' },
        { headline: 'Original', language: null },
      ],
      language: null,
      expected: 'Original',
    },
    {
      name: 'nothing for an unknown language without an Original',
      summaries: [{ headline: 'English', language: 'en' }],
      language: null,
      expected: null,
    },
    {
      name: 'past blank headlines',
      summaries: [
        { headline: '  ', language: null },
        { headline: ' English ', language: 'en' },
      ],
      language: 'en',
      expected: 'English',
    },
  ])('picks $name', ({ summaries, language, expected }) => {
    expect(pickHeadline(summaries, language)).toBe(expected);
  });
});
