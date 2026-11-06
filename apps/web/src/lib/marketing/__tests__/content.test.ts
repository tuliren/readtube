import { markdownToPlainText } from '@/lib/marketing/content';

describe('markdownToPlainText', () => {
  it.each([
    ['plain text', 'Just text.', 'Just text.'],
    ['bold', 'A **bold** word', 'A bold word'],
    ['paragraphs', 'First.\n\nSecond.', 'First.\nSecond.'],
    ['a bullet list', 'Intro:\n\n- **One**: first\n- Two', 'Intro:\nOne: first\nTwo'],
    ['surrounding whitespace', '\n  Text  \n', 'Text'],
  ])('flattens %s', (_case, input, expected) => {
    expect(markdownToPlainText(input)).toBe(expected);
  });
});
