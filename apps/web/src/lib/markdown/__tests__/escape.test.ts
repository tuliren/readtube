import { escapeMarkdownText } from '@/lib/markdown/escape';

describe('escapeMarkdownText', () => {
  it.each([
    ['plain text', 'Plain title', 'Plain title'],
    ['brackets', 'A [b] c', 'A \\[b\\] c'],
    ['emphasis markers', '*bold* _it_', '\\*bold\\* \\_it\\_'],
    ['a backslash', 'a\\b', 'a\\\\b'],
    ['newlines and extra spaces', ' one\n two  three ', 'one two three'],
    ['a hash and pipe', '#1 | best', '\\#1 \\| best'],
  ])('handles %s', (_case, input, expected) => {
    expect(escapeMarkdownText(input)).toBe(expected);
  });
});
