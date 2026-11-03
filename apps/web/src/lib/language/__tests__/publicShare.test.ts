import { parseShareLanguage, resolveShareRow } from '@/lib/language/publicShare';

describe('parseShareLanguage', () => {
  it.each([
    { label: 'missing', raw: null, expected: undefined },
    { label: 'empty', raw: '', expected: undefined },
    { label: 'unknown code', raw: 'xx', expected: undefined },
    { label: 'original', raw: 'original', expected: null },
    { label: 'English', raw: 'en', expected: 'en' },
    { label: 'Simplified Chinese', raw: 'zh-Hans', expected: 'zh-Hans' },
  ])('parses $label', ({ raw, expected }) => {
    expect(parseShareLanguage(raw)).toBe(expected);
  });
});

describe('resolveShareRow', () => {
  const ORIGINAL = '__original__';

  // Rows keyed by language (ORIGINAL for null); the earliest fallback
  // returns 'earliest' whenever any row exists.
  async function resolve(requested: string | null | undefined, available: string[]) {
    const lookups: (string | null)[] = [];
    const row = await resolveShareRow(
      requested,
      async (language) => {
        lookups.push(language);
        const key = language ?? ORIGINAL;
        return available.includes(key) ? key : null;
      },
      async () => (available.length > 0 ? 'earliest' : null)
    );
    return { row, lookups };
  }

  it.each([
    {
      label: 'English for a bare link',
      requested: undefined,
      available: ['en', ORIGINAL, 'zh-Hans'],
      expected: 'en',
    },
    {
      label: 'Original for a bare link without English',
      requested: undefined,
      available: [ORIGINAL, 'zh-Hans'],
      expected: ORIGINAL,
    },
    {
      label: 'earliest for a bare link without English or Original',
      requested: undefined,
      available: ['zh-Hans'],
      expected: 'earliest',
    },
    {
      label: 'the requested translation when it exists',
      requested: 'zh-Hans',
      available: ['en', ORIGINAL, 'zh-Hans'],
      expected: 'zh-Hans',
    },
    {
      label: 'English for a missing requested translation',
      requested: 'ja',
      available: ['en', ORIGINAL],
      expected: 'en',
    },
    {
      label: 'the Original when explicitly requested',
      requested: null,
      available: ['en', ORIGINAL],
      expected: ORIGINAL,
    },
    {
      label: 'English for an explicit Original request without one',
      requested: null,
      available: ['en', 'zh-Hans'],
      expected: 'en',
    },
    { label: 'null when nothing exists', requested: undefined, available: [], expected: null },
  ])('returns $label', async ({ requested, available, expected }) => {
    const { row } = await resolve(requested, available);
    expect(row).toBe(expected);
  });

  it.each([
    { label: 'no language', requested: undefined, expected: ['en', null] },
    { label: 'English', requested: 'en', expected: ['en', null] },
    { label: 'the Original', requested: null, expected: [null, 'en'] },
    { label: 'a translation', requested: 'ja', expected: ['ja', 'en', null] },
  ])('looks each language up once when the URL names $label', async ({ requested, expected }) => {
    const { lookups } = await resolve(requested, []);
    expect(lookups).toEqual(expected);
  });
});
