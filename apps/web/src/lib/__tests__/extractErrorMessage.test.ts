import { extractErrorMessage } from '@/lib/workflows/errorMessage';

const FALLBACK = 'Something failed.';

describe('extractErrorMessage', () => {
  it.each([
    ['an Error instance', new Error('real reason'), 'real reason'],
    ['an Error subclass', new TypeError('type reason'), 'type reason'],
    [
      'a rehydrated error object without the Error prototype',
      { name: 'FatalError', message: 'blocked by content policy' },
      'blocked by content policy',
    ],
    ['a plain string', 'string reason', 'string reason'],
  ])('extracts the message from %s', (_label, err, expected) => {
    expect(extractErrorMessage(err, FALLBACK)).toBe(expected);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['an object without a message', { code: 'USER_ERROR' }],
    ['an object with an empty message', { message: '' }],
    ['an object with a non-string message', { message: 42 }],
  ])('falls back for %s', (_label, err) => {
    expect(extractErrorMessage(err, FALLBACK)).toBe(FALLBACK);
  });
});
