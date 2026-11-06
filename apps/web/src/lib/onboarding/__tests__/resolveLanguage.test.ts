import { detectLanguage } from '@/lib/language/detect';
import {
  MIN_DETECTION_TEXT_LENGTH,
  isUsableLanguageTag,
  resolveContentLanguage,
} from '@/lib/onboarding/resolveLanguage';

// The real detector pulls in ESM-only franc; these tests cover the
// voting and fallback rules, not detection accuracy.
jest.mock('@/lib/language/detect', () => ({
  detectLanguage: jest.fn(),
}));

const mockDetect = detectLanguage as jest.MockedFunction<typeof detectLanguage>;
const LONG_TEXT = 'x'.repeat(MIN_DETECTION_TEXT_LENGTH);

beforeEach(() => {
  mockDetect.mockReset();
});

describe('resolveContentLanguage', () => {
  it.each([
    { name: 'a single transcript language', languages: ['en'], expected: 'en' },
    { name: 'the majority language', languages: ['ja', 'en', 'en'], expected: 'en' },
    { name: 'the first-seen language on a tie', languages: ['zh-Hans', 'en'], expected: 'zh' },
    {
      name: 'variants of one language together',
      languages: ['zh-Hans', 'zh-TW', 'en'],
      expected: 'zh',
    },
    { name: 'null and blank entries skipped', languages: [null, ' ', 'ko'], expected: 'ko' },
    {
      name: 'track markers and free-form names skipped',
      languages: ['asr', 'asr', 'ai', '中文', 'en'],
      expected: 'en',
    },
  ])('uses $name', ({ languages, expected }) => {
    expect(resolveContentLanguage(languages, LONG_TEXT)).toBe(expected);
    expect(mockDetect).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'no transcript language is known', languages: [null] },
    { name: 'only unusable values are stored', languages: ['asr', '中文'] },
  ])('falls back to detecting the text when $name', ({ languages }) => {
    mockDetect.mockReturnValue('en');
    expect(resolveContentLanguage(languages, LONG_TEXT)).toBe('en');
    expect(mockDetect).toHaveBeenCalledWith(LONG_TEXT);
  });

  it('folds a known franc confusion into the intended language', () => {
    mockDetect.mockReturnValue('sco');
    expect(resolveContentLanguage([], LONG_TEXT)).toBe('en');
  });

  it.each([
    {
      name: 'the text is too short',
      text: 'x'.repeat(MIN_DETECTION_TEXT_LENGTH - 1),
      detected: 'en',
    },
    { name: 'detection is undecided', text: LONG_TEXT, detected: null },
  ])('returns null when $name', ({ text, detected }) => {
    mockDetect.mockReturnValue(detected);
    expect(resolveContentLanguage([], text)).toBeNull();
  });
});

describe('isUsableLanguageTag', () => {
  it.each([
    { tag: 'en', expected: true },
    { tag: 'zh-Hans', expected: true },
    { tag: 'pt_BR', expected: true },
    { tag: ' fr ', expected: true },
    { tag: 'asr', expected: false },
    { tag: 'ai', expected: false },
    { tag: 'und', expected: false },
    { tag: '中文', expected: false },
    { tag: 'english', expected: false },
    { tag: '', expected: false },
  ])('returns $expected for "$tag"', ({ tag, expected }) => {
    expect(isUsableLanguageTag(tag)).toBe(expected);
  });
});
