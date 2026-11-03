import { needsEnglishFollowUp } from '@/lib/language/englishFollowUp';

describe('needsEnglishFollowUp', () => {
  it.each([
    { label: 'Simplified Chinese target', target: 'zh-Hans', source: null, expected: true },
    { label: 'Japanese target', target: 'ja', source: null, expected: true },
    { label: 'English target', target: 'en', source: null, expected: false },
    { label: 'English target, non-English source', target: 'en', source: 'zh', expected: false },
    { label: 'Original of a Chinese source', target: null, source: 'zh-CN', expected: true },
    {
      label: 'Original of a Chinese source (ISO 639-3)',
      target: null,
      source: 'cmn',
      expected: true,
    },
    { label: 'Original of an English source', target: null, source: 'en', expected: false },
    {
      label: 'Original of an English source (region tag)',
      target: null,
      source: 'en-US',
      expected: false,
    },
    {
      label: 'Original of an English source (ISO 639-3)',
      target: null,
      source: 'eng',
      expected: false,
    },
    { label: 'Original of an undetectable source', target: null, source: null, expected: false },
  ])('returns $expected for $label', ({ target, source, expected }) => {
    expect(needsEnglishFollowUp(target, source)).toBe(expected);
  });
});
