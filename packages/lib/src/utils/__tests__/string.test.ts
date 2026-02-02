import { isEmptyString } from '../string';

describe('isEmptyString', () => {
  it('returns true for empty null', () => {
    expect(isEmptyString(null)).toBe(true);
  });

  it('returns true for empty undefined', () => {
    expect(isEmptyString(undefined)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isEmptyString('')).toBe(true);
    expect(isEmptyString('    ')).toBe(true);
  });

  it('returns false for non-empty string', () => {
    expect(isEmptyString('Hello')).toBe(false);
  });
});
