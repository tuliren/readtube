import { detectLanguage } from '@/lib/language/detect';
import {
  MIN_DETECTION_TEXT_LENGTH,
  resolveContentLanguage,
  transcriptTagLanguage,
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
    {
      name: 'the language behind a caption-kind prefix',
      languages: ['asr-en', 'ai-zh', 'asr-en'],
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

describe('transcriptTagLanguage', () => {
  it.each([
    { tag: 'en', expected: 'en' },
    { tag: 'zh-Hans', expected: 'zh' },
    { tag: 'pt_BR', expected: 'pt' },
    { tag: ' fr ', expected: 'fr' },
    { tag: 'asr-en', expected: 'en' },
    { tag: 'ai-zh', expected: 'zh' },
    { tag: 'asr', expected: null },
    { tag: 'ai', expected: null },
    { tag: 'und', expected: null },
    { tag: '中文', expected: null },
    { tag: 'english', expected: null },
    { tag: '', expected: null },
  ])('reads "$tag" as $expected', ({ tag, expected }) => {
    expect(transcriptTagLanguage(tag)).toBe(expected);
  });
});
