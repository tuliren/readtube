import {
  ALL_LANGUAGES,
  filterByLanguage,
  languageOptions,
  primaryLanguage,
} from '@/lib/onboarding/language';

describe('primaryLanguage', () => {
  it.each([
    { tag: 'en', expected: 'en' },
    { tag: 'en-US', expected: 'en' },
    { tag: 'en_GB', expected: 'en' },
    { tag: 'zh-Hans', expected: 'zh' },
    { tag: 'zh-TW', expected: 'zh' },
    { tag: 'eng', expected: 'en' },
    { tag: 'cmn', expected: 'zh' },
    { tag: 'JA', expected: 'ja' },
  ])('collapses $tag to $expected', ({ tag, expected }) => {
    expect(primaryLanguage(tag)).toBe(expected);
  });
});

describe('languageOptions', () => {
  it('counts each language, most common first then by name, skipping unknowns', () => {
    const options = languageOptions([
      { language: 'zh' },
      { language: 'en' },
      { language: null },
      { language: 'en' },
      { language: 'ja' },
    ]);
    expect(options).toEqual([
      { code: 'en', label: 'English', count: 2 },
      { code: 'zh', label: 'Chinese', count: 1 },
      { code: 'ja', label: 'Japanese', count: 1 },
    ]);
  });

  it('returns no options when every language is unknown', () => {
    expect(languageOptions([{ language: null }])).toEqual([]);
  });
});

describe('filterByLanguage', () => {
  const items = [
    { id: 'a', language: 'en' },
    { id: 'b', language: 'zh' },
    { id: 'c', language: null },
  ];

  it.each([
    { language: 'en', expected: ['a'] },
    { language: 'zh', expected: ['b'] },
    { language: 'fr', expected: [] },
    { language: ALL_LANGUAGES, expected: ['a', 'b', 'c'] },
  ])('keeps $expected for $language', ({ language, expected }) => {
    expect(filterByLanguage(items, language).map((i) => i.id)).toEqual(expected);
  });
});
