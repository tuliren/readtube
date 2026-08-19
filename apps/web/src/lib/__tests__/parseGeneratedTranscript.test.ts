import {
  TranscriptParseError,
  parseGeneratedTranscript,
} from '@/lib/transcripts/parseGeneratedTranscript';

const seg = (start: string, end: string, text: string) => ({ start, end, text });

describe('parseGeneratedTranscript', () => {
  describe('JSON extraction', () => {
    it.each<{ desc: string; raw: string }>([
      {
        desc: 'parses a bare JSON array',
        raw: JSON.stringify([seg('00:00', '00:05', 'hello')]),
      },
      {
        desc: 'strips ```json fences',
        raw: '```json\n[{"start":"00:00","end":"00:05","text":"hello"}]\n```',
      },
      {
        desc: 'strips bare ``` fences',
        raw: '```\n[{"start":"00:00","end":"00:05","text":"hello"}]\n```',
      },
      {
        desc: 'ignores prose around the array',
        raw: 'Here is the transcript:\n[{"start":"00:00","end":"00:05","text":"hello"}]\nLet me know!',
      },
      {
        desc: 'tolerates a trailing comma before the closing bracket',
        raw: '[{"start":"00:00","end":"00:05","text":"hello"},]',
      },
    ])('$desc', ({ raw }) => {
      const result = parseGeneratedTranscript(raw, { durationMs: null });
      expect(result).toEqual([{ startMs: 0, endMs: 5000, text: 'hello' }]);
    });

    it('salvages output truncated mid-object', () => {
      const raw =
        '[{"start":"00:00","end":"00:05","text":"first"},{"start":"00:05","end":"00:10","text":"second"},{"start":"00:10","end":"00:1';
      const result = parseGeneratedTranscript(raw, { durationMs: null });
      expect(result).toEqual([
        { startMs: 0, endMs: 5000, text: 'first' },
        { startMs: 5000, endMs: 10_000, text: 'second' },
      ]);
    });

    it.each<{ desc: string; raw: string }>([
      { desc: 'throws on prose with no array', raw: 'I could not access this video.' },
      { desc: 'throws on an empty array', raw: '[]' },
      { desc: 'throws on an array of invalid entries', raw: '[{"foo":1},{"bar":2}]' },
      { desc: 'throws on a JSON object instead of an array', raw: '{"start":"00:00"}' },
      { desc: 'throws on unsalvageable truncation', raw: '[{"start":"00:0' },
    ])('$desc', ({ raw }) => {
      expect(() => parseGeneratedTranscript(raw, { durationMs: null })).toThrow(
        TranscriptParseError
      );
    });
  });

  describe('timestamp parsing', () => {
    it.each<{ desc: string; start: unknown; end: unknown; startMs: number; endMs: number }>([
      { desc: 'MM:SS', start: '01:30', end: '01:45', startMs: 90_000, endMs: 105_000 },
      { desc: 'H:MM:SS', start: '1:02:03', end: '1:02:10', startMs: 3_723_000, endMs: 3_730_000 },
      {
        desc: 'HH:MM:SS',
        start: '01:02:03',
        end: '01:02:10',
        startMs: 3_723_000,
        endMs: 3_730_000,
      },
      {
        desc: 'minutes above 59',
        start: '90:12',
        end: '90:20',
        startMs: 5_412_000,
        endMs: 5_420_000,
      },
      { desc: 'bare-second numbers', start: 90, end: 105, startMs: 90_000, endMs: 105_000 },
      { desc: 'fractional seconds', start: 1.5, end: 2.25, startMs: 1500, endMs: 2250 },
    ])('accepts $desc timestamps', ({ start, end, startMs, endMs }) => {
      const raw = JSON.stringify([{ start, end, text: 'hello' }]);
      expect(parseGeneratedTranscript(raw, { durationMs: null })).toEqual([
        { startMs, endMs, text: 'hello' },
      ]);
    });

    it.each<{ desc: string; start: unknown; end: unknown }>([
      { desc: 'a bare seconds string', start: '90', end: '105' },
      { desc: 'negative numbers', start: -5, end: 10 },
      { desc: 'non-numeric parts', start: 'a:bc', end: '00:10' },
      { desc: 'null timestamps', start: null, end: '00:10' },
      { desc: 'missing end', start: '00:00', end: undefined },
      { desc: 'four-part timestamps', start: '1:02:03:04', end: '1:02:03:10' },
    ])('skips entries with $desc', ({ start, end }) => {
      const raw = JSON.stringify([{ start, end, text: 'bad' }, seg('00:00', '00:05', 'good')]);
      expect(parseGeneratedTranscript(raw, { durationMs: null })).toEqual([
        { startMs: 0, endMs: 5000, text: 'good' },
      ]);
    });
  });

  describe('segment validation', () => {
    it.each<{ desc: string; entry: unknown }>([
      { desc: 'empty text', entry: seg('00:00', '00:05', '') },
      { desc: 'whitespace-only text', entry: seg('00:00', '00:05', '   ') },
      { desc: 'non-string text', entry: { start: '00:00', end: '00:05', text: 42 } },
      { desc: 'non-object entries', entry: 'not a segment' },
      { desc: 'null entries', entry: null },
    ])('skips entries with $desc', ({ entry }) => {
      const raw = JSON.stringify([entry, seg('00:10', '00:15', 'good')]);
      expect(parseGeneratedTranscript(raw, { durationMs: null })).toEqual([
        { startMs: 10_000, endMs: 15_000, text: 'good' },
      ]);
    });

    it('trims segment text', () => {
      const raw = JSON.stringify([seg('00:00', '00:05', '  hello  ')]);
      expect(parseGeneratedTranscript(raw, { durationMs: null })[0].text).toBe('hello');
    });

    it('clamps endMs below startMs up to startMs', () => {
      const raw = JSON.stringify([seg('00:10', '00:05', 'inverted')]);
      expect(parseGeneratedTranscript(raw, { durationMs: null })).toEqual([
        { startMs: 10_000, endMs: 10_000, text: 'inverted' },
      ]);
    });

    it('drops entries whose start moves backwards', () => {
      const raw = JSON.stringify([
        seg('00:10', '00:15', 'first'),
        seg('00:05', '00:08', 'backwards'),
        seg('00:20', '00:25', 'second'),
      ]);
      expect(parseGeneratedTranscript(raw, { durationMs: null }).map((s) => s.text)).toEqual([
        'first',
        'second',
      ]);
    });

    it('allows equal consecutive start timestamps', () => {
      const raw = JSON.stringify([seg('00:10', '00:12', 'a'), seg('00:10', '00:15', 'b')]);
      expect(parseGeneratedTranscript(raw, { durationMs: null })).toHaveLength(2);
    });
  });

  describe('duration guard', () => {
    it('drops segments starting past the video duration', () => {
      const raw = JSON.stringify([
        seg('00:10', '00:15', 'inside'),
        seg('10:00', '10:05', 'past the end'),
      ]);
      expect(parseGeneratedTranscript(raw, { durationMs: 60_000 }).map((s) => s.text)).toEqual([
        'inside',
      ]);
    });

    it('clamps endMs overshooting the video duration', () => {
      const raw = JSON.stringify([seg('00:50', '01:10', 'tail')]);
      expect(parseGeneratedTranscript(raw, { durationMs: 60_000 })).toEqual([
        { startMs: 50_000, endMs: 60_000, text: 'tail' },
      ]);
    });

    it('applies no duration limit when durationMs is null', () => {
      const raw = JSON.stringify([seg('99:00', '99:05', 'way out')]);
      expect(parseGeneratedTranscript(raw, { durationMs: null })).toHaveLength(1);
    });
  });
});
