import {
  TARGET_LANGUAGES,
  findTargetLanguage,
  languageNameForPrompt,
  languageTagsMatch,
  normalizeLanguageTag,
} from '@/lib/language/names';

describe('TARGET_LANGUAGES', () => {
  it('has unique BCP-47 codes', () => {
    const codes = TARGET_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('has English among the offered languages', () => {
    const en = TARGET_LANGUAGES.find((l) => l.code === 'en');
    expect(en?.englishName).toBe('English');
  });

  it('splits Chinese into Simplified and Traditional with BCP-47 script subtags', () => {
    const codes = TARGET_LANGUAGES.map((l) => l.code);
    expect(codes).toContain('zh-Hans');
    expect(codes).toContain('zh-Hant');
    expect(codes).not.toContain('zh');
  });
});

describe('findTargetLanguage', () => {
  it.each([
    { code: 'en', expectedName: 'English' },
    { code: 'zh-Hans', expectedName: 'Chinese (Simplified)' },
    { code: 'zh-Hant', expectedName: 'Chinese (Traditional)' },
    { code: 'ja', expectedName: 'Japanese' },
  ])('returns the entry for $code', ({ code, expectedName }) => {
    expect(findTargetLanguage(code)?.englishName).toBe(expectedName);
  });

  it.each([
    { label: 'unknown code', code: 'xx' },
    { label: 'empty string', code: '' },
    { label: 'mixed case', code: 'EN' },
    { label: 'legacy plain "zh" (replaced by Hans/Hant split)', code: 'zh' },
  ])('returns null for $label', ({ code }) => {
    expect(findTargetLanguage(code)).toBeNull();
  });
});

describe('languageNameForPrompt', () => {
  it('returns the English name for known codes', () => {
    expect(languageNameForPrompt('zh-Hans')).toBe('Chinese (Simplified)');
    expect(languageNameForPrompt('zh-Hant')).toBe('Chinese (Traditional)');
    expect(languageNameForPrompt('en')).toBe('English');
  });

  it('falls back to the raw code for unknown languages', () => {
    expect(languageNameForPrompt('fr-CA')).toBe('fr-CA');
    expect(languageNameForPrompt('xx')).toBe('xx');
    expect(languageNameForPrompt('zh')).toBe('zh');
  });
});

describe('normalizeLanguageTag', () => {
  it.each([
    { label: 'bare primary subtag', input: 'zh', expected: 'zh' },
    { label: 'BCP-47 simplified Chinese', input: 'zh-Hans', expected: 'zh-hans' },
    { label: 'BCP-47 traditional Chinese', input: 'zh-Hant', expected: 'zh-hant' },
    { label: 'BCP-47 Chinese (China) → Simplified', input: 'zh-CN', expected: 'zh-hans' },
    { label: 'BCP-47 Chinese (Singapore) → Simplified', input: 'zh-SG', expected: 'zh-hans' },
    { label: 'BCP-47 Chinese (Taiwan) → Traditional', input: 'zh-TW', expected: 'zh-hant' },
    { label: 'BCP-47 Chinese (Hong Kong) → Traditional', input: 'zh-HK', expected: 'zh-hant' },
    { label: 'BCP-47 Canadian French', input: 'fr-CA', expected: 'fr' },
    { label: 'BCP-47 US English', input: 'en-US', expected: 'en' },
    { label: 'uppercase primary', input: 'ZH', expected: 'zh' },
    { label: 'mixed case Chinese script', input: 'Zh-Hans', expected: 'zh-hans' },
    { label: 'ISO 639-3 Mandarin (no script signal)', input: 'cmn', expected: 'zh' },
    { label: 'ISO 639-3 English', input: 'eng', expected: 'en' },
    { label: 'ISO 639-3 Cantonese collapses to Chinese', input: 'yue', expected: 'zh' },
    { label: 'unknown region drops to primary', input: 'zh-XX', expected: 'zh' },
    { label: 'unknown 3-letter passes through', input: 'epo', expected: 'epo' },
  ])('normalizes $label ($input → $expected)', ({ input, expected }) => {
    expect(normalizeLanguageTag(input)).toBe(expected);
  });
});

describe('languageTagsMatch', () => {
  it.each([
    { label: 'identical primary', a: 'en', b: 'en' },
    { label: 'BCP-47 region collapse', a: 'fr-CA', b: 'fr' },
    { label: 'Chinese Simplified (script vs region)', a: 'zh-Hans', b: 'zh-CN' },
    { label: 'Chinese Traditional (script vs region)', a: 'zh-Hant', b: 'zh-TW' },
    { label: 'Chinese Traditional (HK to TW)', a: 'zh-HK', b: 'zh-TW' },
    { label: 'ambiguous Chinese matches Simplified', a: 'zh', b: 'zh-Hans' },
    { label: 'ambiguous Chinese matches Traditional', a: 'zh', b: 'zh-Hant' },
    { label: 'cmn (no script) matches Simplified', a: 'cmn', b: 'zh-Hans' },
    { label: 'cmn matches Traditional', a: 'cmn', b: 'zh-Hant' },
    { label: 'ISO 639-3 to 2 letter', a: 'eng', b: 'en' },
  ])('matches $label', ({ a, b }) => {
    expect(languageTagsMatch(a, b)).toBe(true);
    expect(languageTagsMatch(b, a)).toBe(true);
  });

  it.each([
    { label: 'Simplified vs Traditional explicit', a: 'zh-Hans', b: 'zh-Hant' },
    { label: 'Mainland vs Taiwan (different scripts)', a: 'zh-CN', b: 'zh-TW' },
    { label: 'unrelated languages', a: 'en', b: 'zh' },
    { label: 'unrelated languages with script', a: 'en', b: 'zh-Hans' },
    { label: 'French vs English', a: 'fr', b: 'en' },
  ])('does not match $label', ({ a, b }) => {
    expect(languageTagsMatch(a, b)).toBe(false);
    expect(languageTagsMatch(b, a)).toBe(false);
  });
});
