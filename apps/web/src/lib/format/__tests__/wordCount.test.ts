import { countWords } from '../wordCount';

describe('countWords', () => {
  it.each<{ input: string | null | undefined; expected: number; desc: string }>([
    { input: '', expected: 0, desc: 'empty string' },
    { input: '   ', expected: 0, desc: 'whitespace only' },
    { input: null, expected: 0, desc: 'null' },
    { input: undefined, expected: 0, desc: 'undefined' },
    { input: 'hello', expected: 1, desc: 'single word' },
    { input: 'hello world', expected: 2, desc: 'two words' },
    {
      input: '  the   quick   brown   fox  ',
      expected: 4,
      desc: 'collapses runs of whitespace',
    },
    {
      input: 'one,two,three!',
      expected: 3,
      desc: 'punctuation does not count as a word',
    },
    {
      input: '- bullet one\n- bullet two\n- bullet three',
      expected: 6,
      desc: 'markdown bullet syntax is filtered out',
    },
    {
      input: 'Run `yarn typecheck` to verify.',
      expected: 5,
      desc: 'inline code backticks are filtered',
    },
  ])('$desc', ({ input, expected }) => {
    expect(countWords(input)).toBe(expected);
  });
});
