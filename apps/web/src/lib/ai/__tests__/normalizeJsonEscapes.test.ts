import { normalizeLlmJsonEscapes } from '@/lib/ai/normalizeJsonEscapes';

describe('normalizeLlmJsonEscapes', () => {
  it.each([
    { name: 'empty string', input: '', expected: '' },
    { name: 'plain text', input: 'hello world', expected: 'hello world' },
    { name: 'real newline passes through', input: 'a\nb', expected: 'a\nb' },
    { name: 'literal \\n becomes newline', input: 'a\\nb', expected: 'a\nb' },
    { name: 'literal \\t becomes tab', input: 'a\\tb', expected: 'a\tb' },
    { name: 'literal \\r becomes carriage return', input: 'a\\rb', expected: 'a\rb' },
    {
      name: 'paragraph separator \\n\\n becomes two newlines',
      input: 'p1.\\n\\np2.',
      expected: 'p1.\n\np2.',
    },
    {
      name: 'bullet pattern \\n- becomes newline + dash',
      input: 'intro.\\n- one\\n- two',
      expected: 'intro.\n- one\n- two',
    },
    {
      name: 'CJK content with literal escapes',
      input: '段落一。\\n\\n段落二。',
      expected: '段落一。\n\n段落二。',
    },
    {
      name: 'escaped backslash followed by n is preserved',
      input: 'use \\\\n for newline',
      expected: 'use \\\\n for newline',
    },
    {
      name: 'three backslashes + n = two literal backslashes + real newline',
      input: 'a\\\\\\nb',
      expected: 'a\\\\\nb',
    },
    {
      name: 'four backslashes + n = two literal backslashes + n preserved',
      input: 'a\\\\\\\\nb',
      expected: 'a\\\\\\\\nb',
    },
  ])('$name', ({ input, expected }) => {
    expect(normalizeLlmJsonEscapes(input)).toBe(expected);
  });

  describe('streaming prefix-stability', () => {
    it.each([
      { prefix: 'abc', longer: 'abc\\nxyz' },
      { prefix: 'abc\\', longer: 'abc\\nxyz' },
      { prefix: 'abc\\n', longer: 'abc\\nxyz' },
      { prefix: 'abc\\nxy', longer: 'abc\\nxyz' },
      { prefix: 'a', longer: 'a\\\\n' },
      { prefix: 'a\\', longer: 'a\\\\n' },
      { prefix: 'a\\\\', longer: 'a\\\\n' },
      { prefix: '段落一。', longer: '段落一。\\n\\n段落二。' },
      { prefix: '段落一。\\', longer: '段落一。\\n\\n段落二。' },
      { prefix: '段落一。\\n', longer: '段落一。\\n\\n段落二。' },
      { prefix: '段落一。\\n\\', longer: '段落一。\\n\\n段落二。' },
    ])('normalize($prefix) is a prefix of normalize($longer)', ({ prefix, longer }) => {
      const normalizedPrefix = normalizeLlmJsonEscapes(prefix);
      const normalizedLonger = normalizeLlmJsonEscapes(longer);
      expect(normalizedLonger.startsWith(normalizedPrefix)).toBe(true);
    });

    it('lone trailing backslash is deferred (stripped from output)', () => {
      expect(normalizeLlmJsonEscapes('abc\\')).toBe('abc');
    });

    it('trailing backslash run is deferred regardless of length', () => {
      expect(normalizeLlmJsonEscapes('abc\\\\\\')).toBe('abc');
    });

    it('non-escape backslash sequences in middle are preserved', () => {
      expect(normalizeLlmJsonEscapes('a\\xb')).toBe('a\\xb');
    });
  });
});
