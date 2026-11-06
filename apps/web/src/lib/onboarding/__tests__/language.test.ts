import {
  ALL_LANGUAGES,
  filterByLanguage,
  languageDisplayName,
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

describe('languageDisplayName', () => {
  it.each([
    { code: 'en', expected: 'English' },
    { code: 'zh', expected: 'Chinese' },
    { code: 'he', expected: 'Hebrew' },
    { code: 'bg', expected: 'Bulgarian' },
    { code: 'sw', expected: 'Swahili' },
    { code: 'xx', expected: null },
    { code: 'not a tag', expected: null },
  ])('names $code as $expected', ({ code, expected }) => {
    expect(languageDisplayName(code)).toBe(expected);
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

  it.each([
    { name: 'unknown', language: null },
    { name: 'a code with no name', language: 'xx' },
  ])('offers no chip for $name', ({ language }) => {
    expect(languageOptions([{ language }])).toEqual([]);
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
