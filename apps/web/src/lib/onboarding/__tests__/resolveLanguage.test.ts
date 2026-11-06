import { detectLanguage } from '@/lib/language/detect';
import {
  MIN_DETECTION_TEXT_LENGTH,
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
  ])('uses $name', ({ languages, expected }) => {
    expect(resolveContentLanguage(languages, LONG_TEXT)).toBe(expected);
    expect(mockDetect).not.toHaveBeenCalled();
  });

  it('falls back to detecting the text when no transcript language is known', () => {
    mockDetect.mockReturnValue('en');
    expect(resolveContentLanguage([null], LONG_TEXT)).toBe('en');
    expect(mockDetect).toHaveBeenCalledWith(LONG_TEXT);
  });

  it.each([
    { name: 'the text is too short', text: 'short title', detected: 'en' },
    { name: 'detection is undecided', text: LONG_TEXT, detected: null },
  ])('returns null when $name', ({ text, detected }) => {
    mockDetect.mockReturnValue(detected);
    expect(resolveContentLanguage([], text)).toBeNull();
  });
});
