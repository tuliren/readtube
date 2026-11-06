import { markdownToPlainText } from '@/lib/markdown/plainText';

describe('markdownToPlainText', () => {
  it.each([
    ['plain text', 'Just text.', 'Just text.'],
    ['bold', 'A **bold** word', 'A bold word'],
    ['underscore bold', 'A __bold__ word', 'A bold word'],
    ['italic', 'An *italic* and _italic_ word', 'An italic and italic word'],
    ['inline code', 'Run `yarn test` now', 'Run yarn test now'],
    ['a link', 'See [the docs](https://example.com).', 'See the docs.'],
    ['an image', '![alt text](https://example.com/a.png)', 'alt text'],
    ['a heading', '## Heading\n\nBody.', 'Heading\nBody.'],
    ['paragraphs', 'First.\n\nSecond.', 'First.\nSecond.'],
    ['a bullet list', 'Intro:\n\n- **One**: first\n- Two', 'Intro:\nOne: first\nTwo'],
    ['star and plus bullets', '* One\n+ Two', 'One\nTwo'],
    ['surrounding whitespace', '\n  Text  \n', 'Text'],
    ['a lone star', 'Compute 5 * 3 in C*', 'Compute 5 * 3 in C*'],
    ['a stray backtick', 'Use the ` key', 'Use the ` key'],
    ['snake_case words', 'Set max_token_count here', 'Set max_token_count here'],
  ])('flattens %s', (_case, input, expected) => {
    expect(markdownToPlainText(input)).toBe(expected);
  });
});
