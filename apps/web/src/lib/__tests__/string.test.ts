import { isEmptyString, toOneLine } from '@/lib/string';

describe('isEmptyString', () => {
  it.each([
    { value: null, expected: true },
    { value: undefined, expected: true },
    { value: '', expected: true },
    { value: ' ', expected: true },
    { value: '   ', expected: true },
    { value: '\t', expected: true },
    { value: '\n', expected: true },
    { value: ' \t\n ', expected: true },
  ])('returns true for $value', ({ value, expected }) => {
    expect(isEmptyString(value)).toBe(expected);
  });

  it.each([
    { value: 'a', expected: false },
    { value: 'hello', expected: false },
    { value: '  hello  ', expected: false },
    { value: '0', expected: false },
    { value: 'false', expected: false },
    { value: ' . ', expected: false },
  ])('returns false for $value', ({ value, expected }) => {
    expect(isEmptyString(value)).toBe(expected);
  });
});

describe('toOneLine', () => {
  it.each<{ value: string | null | undefined; expected: string | null }>([
    { value: null, expected: null },
    { value: undefined, expected: null },
    { value: ' \n\t ', expected: null },
    { value: 'hello', expected: 'hello' },
    { value: '  hello  ', expected: 'hello' },
    { value: 'first\n\nsecond\t third', expected: 'first second third' },
  ])('returns $expected for $value', ({ value, expected }) => {
    expect(toOneLine(value)).toBe(expected);
  });
});
