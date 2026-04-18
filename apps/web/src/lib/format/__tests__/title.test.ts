import { PAGE_TITLE_CAP, capTitle } from '../title';

describe('capTitle', () => {
  it.each([
    ['empty', '', ''],
    ['short', 'Hello', 'Hello'],
    ['exactly at cap', 'a'.repeat(PAGE_TITLE_CAP), 'a'.repeat(PAGE_TITLE_CAP)],
    ['one over cap', 'a'.repeat(PAGE_TITLE_CAP + 1), `${'a'.repeat(PAGE_TITLE_CAP - 1)}…`],
  ])('%s', (_label, input, expected) => {
    expect(capTitle(input)).toBe(expected);
  });

  it('trims trailing whitespace before the ellipsis', () => {
    const input = `${'a'.repeat(PAGE_TITLE_CAP - 1)}   and more`;
    const out = capTitle(input);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });

  it('respects a custom max length', () => {
    expect(capTitle('abcdefghij', 5)).toBe('abcd…');
  });
});
