import { buildLanguageRule, parseLanguageQuery } from '@/lib/language/prompt';

describe('buildLanguageRule', () => {
  it('returns the "match transcript" rule when target is null', () => {
    const rule = buildLanguageRule(null);
    expect(rule).toMatch(/same natural language as the transcript/i);
    expect(rule).toMatch(/CRITICAL LANGUAGE REQUIREMENT/);
  });

  it.each([['Chinese'], ['Japanese'], ['Spanish'], ['English'], ['French'], ['German']])(
    'does not enumerate %s in the Original-target rule',
    (langName) => {
      // Earlier wording listed Chinese/Japanese/Spanish as examples and
      // the model would sometimes latch onto one of those names instead
      // of detecting from the transcript. Lock the regression out.
      expect(buildLanguageRule(null)).not.toContain(langName);
    }
  );

  it.each([
    { target: 'en', expectedName: 'English' },
    { target: 'zh', expectedName: 'Chinese' },
    { target: 'ja', expectedName: 'Japanese' },
  ])('writes "$expectedName" when target is $target', ({ target, expectedName }) => {
    const rule = buildLanguageRule(target);
    expect(rule).toContain(`MUST be written in ${expectedName}`);
    expect(rule).toMatch(/regardless of the transcript's source language/);
  });

  it('falls back to the raw code for unknown target languages', () => {
    expect(buildLanguageRule('fr-CA')).toContain('MUST be written in fr-CA');
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
