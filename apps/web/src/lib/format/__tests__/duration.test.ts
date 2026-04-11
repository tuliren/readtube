import { formatDurationSeconds } from '../duration';

describe('formatDurationSeconds', () => {
  it.each<{ input: number | null | undefined; expected: string | null; desc: string }>([
    { input: 0, expected: '0:00', desc: 'zero seconds' },
    { input: 7, expected: '0:07', desc: 'pads single-digit seconds' },
    { input: 60, expected: '1:00', desc: 'exact minute' },
    { input: 754, expected: '12:34', desc: 'mm:ss' },
    { input: 3600, expected: '1:00:00', desc: 'exact hour rolls into h:mm:ss' },
    { input: 3723, expected: '1:02:03', desc: 'h:mm:ss with single-digit minute' },
    { input: 36000, expected: '10:00:00', desc: 'two-digit hours' },
    { input: 12.7, expected: '0:12', desc: 'fractional seconds floored' },
    { input: null, expected: null, desc: 'null returns null' },
    { input: undefined, expected: null, desc: 'undefined returns null' },
    { input: -5, expected: null, desc: 'negative returns null' },
    { input: Number.NaN, expected: null, desc: 'NaN returns null' },
    { input: Number.POSITIVE_INFINITY, expected: null, desc: 'Infinity returns null' },
  ])('$desc', ({ input, expected }) => {
    expect(formatDurationSeconds(input)).toBe(expected);
  });
});
