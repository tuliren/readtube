import { buildLanguageRule, parseLanguageQuery } from '@/lib/language/prompt';

describe('buildLanguageRule', () => {
  it('uses the explicit source language for Original requests', () => {
    // Caller pre-detected English from the transcript and passed it
    // through. Prompt should name the language explicitly so the model
    // doesn't have to guess from the transcript body.
    const rule = buildLanguageRule(null, 'en');
    expect(rule).toContain('MUST be written in English');
    expect(rule).toMatch(/matching the transcript's source language/i);
    expect(rule).toMatch(/CRITICAL LANGUAGE REQUIREMENT/);
    expect(rule).toMatch(/Do not translate/i);
  });

  it.each([
    { source: 'ja', expectedName: 'Japanese' },
    { source: 'es', expectedName: 'Spanish' },
    { source: 'zh', expectedName: 'Chinese' },
    { source: 'ko', expectedName: 'Korean' },
    { source: 'fr', expectedName: 'French' },
    { source: 'ar', expectedName: 'Arabic' },
  ])(
    'names $expectedName when source language is $source for an Original request',
    ({ source, expectedName }) => {
      expect(buildLanguageRule(null, source)).toContain(`MUST be written in ${expectedName}`);
    }
  );

  it.each([
    { label: 'null source', source: null },
    { label: 'undefined source', source: undefined },
  ] as const)('defaults to English when target is null and source is $label', ({ source }) => {
    // Detection inconclusive — better a deterministic fallback than
    // asking the model to guess. English is the safest default for
    // this user base.
    const rule = buildLanguageRule(null, source);
    expect(rule).toContain('MUST be written in English');
    expect(rule).toMatch(/matching the transcript's source language/i);
  });

  it.each([
    { target: 'en', expectedName: 'English' },
    { target: 'zh-Hans', expectedName: 'Chinese (Simplified)' },
    { target: 'zh-Hant', expectedName: 'Chinese (Traditional)' },
    { target: 'ja', expectedName: 'Japanese' },
  ])('writes "$expectedName" when target is $target', ({ target, expectedName }) => {
    const rule = buildLanguageRule(target);
    expect(rule).toContain(`MUST be written in ${expectedName}`);
    expect(rule).toMatch(/regardless of the transcript's source language/);
  });

  it('falls back to the raw code for unknown target languages', () => {
    expect(buildLanguageRule('fr-CA')).toContain('MUST be written in fr-CA');
  });

  it('ignores sourceLanguage when target is set (translation requests)', () => {
    // Target overrides source — caller asked for translation, source
    // is irrelevant here.
    const rule = buildLanguageRule('en', 'ja');
    expect(rule).toContain('MUST be written in English');
    expect(rule).not.toContain('Japanese');
  });
});

describe('parseLanguageQuery', () => {
  it.each([
    { label: 'null', input: null, expected: { kind: 'unspecified' } },
    { label: 'undefined', input: undefined, expected: { kind: 'unspecified' } },
    { label: 'empty string', input: '', expected: { kind: 'unspecified' } },
    { label: 'whitespace only', input: '   ', expected: { kind: 'unspecified' } },
    { label: 'literal "original"', input: 'original', expected: { kind: 'original' } },
    { label: 'mixed case "Original"', input: 'Original', expected: { kind: 'original' } },
    { label: 'BCP-47 code', input: 'en', expected: { kind: 'target', code: 'en' } },
    {
      label: 'BCP-47 code with whitespace',
      input: '  zh  ',
      expected: { kind: 'target', code: 'zh' },
    },
  ] as const)('returns $expected for $label', ({ input, expected }) => {
    expect(parseLanguageQuery(input)).toEqual(expected);
  });
});
