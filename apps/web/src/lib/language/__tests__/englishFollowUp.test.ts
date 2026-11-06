import { englishFollowUpSlot } from '@/lib/language/englishFollowUp';

const EN = { language: 'en', sourceLanguage: null };

describe('englishFollowUpSlot', () => {
  it.each([
    { label: 'English target', target: 'en', source: 'zh', expected: null },
    { label: 'English target, unknown source', target: 'en', source: null, expected: null },
    {
      label: 'Chinese target over a Japanese source',
      target: 'zh-Hans',
      source: 'ja',
      expected: EN,
    },
    { label: 'Japanese target over an unknown source', target: 'ja', source: null, expected: EN },
    {
      label: 'Chinese target over an English source',
      target: 'zh-Hans',
      source: 'en',
      expected: { language: null, sourceLanguage: 'en' },
    },
    {
      label: 'Chinese target over an English source (ISO 639-3)',
      target: 'zh-Hans',
      source: 'eng',
      expected: { language: null, sourceLanguage: 'eng' },
    },
    { label: 'Original of a Chinese source', target: null, source: 'zh-CN', expected: EN },
    {
      label: 'Original of a Chinese source (ISO 639-3)',
      target: null,
      source: 'cmn',
      expected: EN,
    },
    { label: 'Original of an English source', target: null, source: 'en', expected: null },
    {
      label: 'Original of an English source (region tag)',
      target: null,
      source: 'en-US',
      expected: null,
    },
    { label: 'Original of an undetectable source', target: null, source: null, expected: null },
  ])('picks the slot for $label', ({ target, source, expected }) => {
    expect(englishFollowUpSlot(target, source)).toEqual(expected);
  });
});
