import { detectLanguage } from '@/lib/language/detect';

// franc and iso-639-3 are ESM-only; ts-jest can't transform them. Mock
// the surface we use so the test runs in CommonJS land — this trades
// "verifies real franc accuracy" for "verifies the helper's own
// translation logic". Real franc is exercised end-to-end by the
// integration tests + the API route's lazy detection.

jest.mock('franc', () => ({
  __esModule: true,
  franc: jest.fn((text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return 'und';
    }
    if (/^[一-鿿]+$/.test(trimmed)) {
      return 'cmn';
    }
    if (/^[぀-ヿ]/.test(trimmed)) {
      return 'jpn';
    }
    if (/^[a-zA-Z\s.,!?]+$/.test(trimmed)) {
      return 'eng';
    }
    return 'und';
  }),
}));

jest.mock('iso-639-3', () => ({
  __esModule: true,
  iso6393To1: {
    eng: 'en',
    cmn: 'zh',
    jpn: 'ja',
  },
}));

describe('detectLanguage', () => {
  it.each([
    {
      label: 'English (eng)',
      input: 'The quick brown fox jumps over the lazy dog.',
      expected: 'en',
    },
    { label: 'Chinese (cmn)', input: '今天天气很好我们去散步吧', expected: 'zh' },
    { label: 'Japanese (jpn)', input: 'これは日本語のテストです', expected: 'ja' },
  ])('maps $label → BCP-47 ($expected)', ({ input, expected }) => {
    expect(detectLanguage(input)).toBe(expected);
  });

  it.each([
    { label: 'empty string', input: '' },
    { label: 'whitespace only', input: '   \n\t  ' },
    { label: 'undetected gibberish', input: '!@#$%^&*()' },
  ])('returns null for $label', ({ input }) => {
    expect(detectLanguage(input)).toBeNull();
  });

  it('falls back to the ISO 639-3 code when no 2-letter mapping exists', () => {
    // Trigger our mock's und/eng/cmn/jpn branches by passing an
    // English-looking string — but force the iso6393To1 lookup to miss
    // by re-mocking the module for this case.
    jest.resetModules();
    jest.doMock('franc', () => ({
      __esModule: true,
      franc: () => 'epo', // Esperanto — present in real iso6393To1 but absent here
    }));
    jest.doMock('iso-639-3', () => ({
      __esModule: true,
      iso6393To1: {},
    }));
    const { detectLanguage: freshDetect } = require('@/lib/language/detect');
    expect(freshDetect('Saluton mondo')).toBe('epo');
  });
});
