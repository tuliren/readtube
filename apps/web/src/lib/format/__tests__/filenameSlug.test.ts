import { filenameSlug } from '../filenameSlug';

describe('filenameSlug', () => {
  it.each<{ input: string; expected: string; desc: string }>([
    { input: '', expected: 'export', desc: 'empty string falls back to "export"' },
    { input: '   ', expected: 'export', desc: 'whitespace only falls back' },
    { input: '!!!', expected: 'export', desc: 'all-special-character input falls back' },
    {
      input: 'How To Build A Rocket',
      expected: 'how-to-build-a-rocket',
      desc: 'collapses spaces and lowercases',
    },
    {
      input: '  Hello   World  ',
      expected: 'hello-world',
      desc: 'collapses runs of whitespace and trims',
    },
    {
      input: 'foo: bar / baz?',
      expected: 'foo-bar-baz',
      desc: 'strips filesystem-unsafe punctuation',
    },
    {
      input: '学习编程-summary',
      expected: '学习编程-summary',
      desc: 'preserves CJK characters',
    },
    {
      input: 'Café résumé',
      expected: 'café-résumé',
      desc: 'preserves Latin letters with diacritics',
    },
    {
      input: 'Привет мир',
      expected: 'привет-мир',
      desc: 'preserves Cyrillic letters',
    },
    {
      input: '---title---',
      expected: 'title',
      desc: 'trims leading and trailing hyphens',
    },
    {
      input: 'a'.repeat(120),
      expected: 'a'.repeat(80),
      desc: 'truncates to the 80-character cap',
    },
    {
      input: Array.from({ length: 42 }, (_, i) => String.fromCharCode(97 + (i % 26))).join('-'),
      expected: Array.from({ length: 40 }, (_, i) => String.fromCharCode(97 + (i % 26))).join('-'),
      desc: 'strips the trailing hyphen left behind by the 80-char cap',
    },
    {
      input: 'snake_case_title',
      expected: 'snake-case-title',
      desc: 'underscores become hyphens',
    },
  ])('$desc', ({ input, expected }) => {
    expect(filenameSlug(input)).toBe(expected);
  });
});
