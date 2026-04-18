import { parseSrt } from '../parseSrt';

describe('parseSrt', () => {
  it("parses kedou's non-standard timestamps with unpadded H/M/S and variable ms", () => {
    const srt = [
      '1',
      '0:0:0,12 --> 0:0:0,74',
      'Pocke4',
      '',
      '2',
      '0:0:0,74 --> 0:0:3,6',
      '我们所有人都以为大江会像网上泄露的那样',
      '',
      '3',
      '0:0:3,6 --> 0:0:5,12',
      '给它加上两个脑袋对吧',
      '',
    ].join('\n');

    expect(parseSrt(srt)).toEqual([
      { startMs: 120, endMs: 740, text: 'Pocke4' },
      { startMs: 740, endMs: 3600, text: '我们所有人都以为大江会像网上泄露的那样' },
      { startMs: 3600, endMs: 5120, text: '给它加上两个脑袋对吧' },
    ]);
  });

  it('parses standard zero-padded SRT format with 3-digit ms', () => {
    const srt = '1\n00:01:02,345 --> 00:01:05,600\nhello world\n';
    expect(parseSrt(srt)).toEqual([{ startMs: 62_345, endMs: 65_600, text: 'hello world' }]);
  });

  it('joins multi-line text with newlines', () => {
    const srt = '1\n0:0:0,0 --> 0:0:1,0\nline one\nline two\n';
    expect(parseSrt(srt)).toEqual([{ startMs: 0, endMs: 1000, text: 'line one\nline two' }]);
  });

  it.each([
    ['empty string', ''],
    ['only whitespace', '   \n\n  '],
  ])('returns an empty array for %s', (_label, input) => {
    expect(parseSrt(input)).toEqual([]);
  });

  it('skips blocks without a timestamp line', () => {
    const srt = ['1', 'no timestamps here', '', '2', '0:0:1,0 --> 0:0:2,0', 'ok', ''].join('\n');
    expect(parseSrt(srt)).toEqual([{ startMs: 1000, endMs: 2000, text: 'ok' }]);
  });

  it('handles CRLF line endings', () => {
    const srt = '1\r\n0:0:0,0 --> 0:0:1,0\r\nhi\r\n';
    expect(parseSrt(srt)).toEqual([{ startMs: 0, endMs: 1000, text: 'hi' }]);
  });
});
