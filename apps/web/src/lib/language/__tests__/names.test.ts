import { TARGET_LANGUAGES, findTargetLanguage, languageNameForPrompt } from '@/lib/language/names';

describe('TARGET_LANGUAGES', () => {
  it('has unique BCP-47 codes', () => {
    const codes = TARGET_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('has English among the offered languages', () => {
    const en = TARGET_LANGUAGES.find((l) => l.code === 'en');
    expect(en?.englishName).toBe('English');
  });
});

describe('findTargetLanguage', () => {
  it.each([
    { code: 'en', expectedName: 'English' },
    { code: 'zh', expectedName: 'Chinese' },
    { code: 'ja', expectedName: 'Japanese' },
  ])('returns the entry for $code', ({ code, expectedName }) => {
    expect(findTargetLanguage(code)?.englishName).toBe(expectedName);
  });

  it.each([
    { label: 'unknown code', code: 'xx' },
    { label: 'empty string', code: '' },
    { label: 'mixed case', code: 'EN' },
  ])('returns null for $label', ({ code }) => {
    expect(findTargetLanguage(code)).toBeNull();
  });
});

describe('languageNameForPrompt', () => {
  it('returns the English name for known codes', () => {
    expect(languageNameForPrompt('zh')).toBe('Chinese');
  });

  it('falls back to the raw code for unknown languages', () => {
    expect(languageNameForPrompt('fr-CA')).toBe('fr-CA');
    expect(languageNameForPrompt('xx')).toBe('xx');
  });
});
