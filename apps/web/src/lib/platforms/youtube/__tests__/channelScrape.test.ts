import { parseDurationText } from '../channelScrape';

describe('parseDurationText', () => {
  it.each<{ input: string | null | undefined; expected: number | null; desc: string }>([
    { input: '0:42', expected: 42, desc: 'm:ss under one minute' },
    { input: '12:34', expected: 12 * 60 + 34, desc: 'mm:ss' },
    { input: '1:02:03', expected: 3600 + 2 * 60 + 3, desc: 'h:mm:ss' },
    { input: '0:00', expected: 0, desc: 'all-zero duration' },
    { input: '  4:20  ', expected: 4 * 60 + 20, desc: 'whitespace tolerated' },
    { input: '', expected: null, desc: 'empty string' },
    { input: undefined, expected: null, desc: 'undefined' },
    { input: null, expected: null, desc: 'null' },
    { input: 'LIVE', expected: null, desc: 'live placeholder is not a duration' },
    { input: '12', expected: null, desc: 'single segment is not parseable' },
    { input: '1:2:3:4', expected: null, desc: 'too many segments' },
    { input: '12:ab', expected: null, desc: 'non-digit segment rejected' },
    { input: '-1:00', expected: null, desc: 'negative segment rejected' },
  ])('$desc', ({ input, expected }) => {
    expect(parseDurationText(input)).toBe(expected);
  });
});
