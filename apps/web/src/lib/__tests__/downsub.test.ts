import { parseSrtToSegments } from '../subtitles/fetchViaDownsub';

describe('parseSrtToSegments', () => {
  it('parses a standard SRT block', () => {
    const srt = [
      '1',
      '00:00:12,160 --> 00:00:14,197',
      'I grew up to study the brain',
      '',
      '2',
      '00:00:14,239 --> 00:00:16,656',
      'because I have a brother',
      'who has been diagnosed',
    ].join('\n');

    const segments = parseSrtToSegments(srt);

    expect(segments).toEqual([
      { startMs: 12160, endMs: 14197, text: 'I grew up to study the brain' },
      {
        startMs: 14239,
        endMs: 16656,
        text: 'because I have a brother who has been diagnosed',
      },
    ]);
  });

  it('handles dot as millisecond separator', () => {
    const srt = ['1', '00:01:30.500 --> 00:01:32.750', 'Hello world'].join('\n');

    const segments = parseSrtToSegments(srt);

    expect(segments).toEqual([{ startMs: 90500, endMs: 92750, text: 'Hello world' }]);
  });

  it('skips blocks with empty text', () => {
    const srt = [
      '1',
      '00:00:00,000 --> 00:00:01,000',
      '',
      '',
      '2',
      '00:00:01,000 --> 00:00:02,000',
      'Actual content',
    ].join('\n');

    const segments = parseSrtToSegments(srt);

    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Actual content');
  });

  it('returns empty array for empty input', () => {
    expect(parseSrtToSegments('')).toEqual([]);
  });

  it('handles multi-line subtitle text', () => {
    const srt = ['1', '00:00:05,000 --> 00:00:10,000', 'Line one', 'Line two', 'Line three'].join(
      '\n'
    );

    const segments = parseSrtToSegments(srt);

    expect(segments).toEqual([
      { startMs: 5000, endMs: 10000, text: 'Line one Line two Line three' },
    ]);
  });

  it.each([
    { ts: '00:00:00,000', expected: 0, desc: 'zero' },
    { ts: '00:00:01,500', expected: 1500, desc: '1.5 seconds' },
    { ts: '01:30:45,123', expected: 5445123, desc: '1h 30m 45.123s' },
    { ts: '00:34:57,000', expected: 2097000, desc: '34 minutes 57 seconds' },
  ])('correctly parses timestamp $desc ($ts)', ({ ts, expected }) => {
    const srt = `1\n${ts} --> ${ts}\ntest`;
    const segments = parseSrtToSegments(srt);
    expect(segments[0].startMs).toBe(expected);
  });
});
