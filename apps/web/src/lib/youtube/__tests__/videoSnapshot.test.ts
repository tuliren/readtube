import { extractVideoId, parseIsoDurationSeconds } from '../videoSnapshot';

const VALID_VIDEO_ID = 'dQw4w9WgXcQ';

describe('extractVideoId', () => {
  it.each([
    ['bare 11-char id', VALID_VIDEO_ID, VALID_VIDEO_ID],
    ['watch URL', `https://www.youtube.com/watch?v=${VALID_VIDEO_ID}`, VALID_VIDEO_ID],
    ['watch URL no www', `https://youtube.com/watch?v=${VALID_VIDEO_ID}`, VALID_VIDEO_ID],
    ['youtu.be short URL', `https://youtu.be/${VALID_VIDEO_ID}`, VALID_VIDEO_ID],
    ['youtu.be with query', `https://youtu.be/${VALID_VIDEO_ID}?t=42`, VALID_VIDEO_ID],
    ['shorts URL', `https://www.youtube.com/shorts/${VALID_VIDEO_ID}`, VALID_VIDEO_ID],
    ['embed URL', `https://www.youtube.com/embed/${VALID_VIDEO_ID}`, VALID_VIDEO_ID],
    [
      'watch URL with extra params',
      `https://www.youtube.com/watch?v=${VALID_VIDEO_ID}&list=PL123`,
      VALID_VIDEO_ID,
    ],
  ])('extracts from %s', (_label, input, expected) => {
    expect(extractVideoId(input)).toBe(expected);
  });

  it.each([
    ['empty string', ''],
    ['non-youtube URL', 'https://vimeo.com/12345'],
    ['channel URL', 'https://youtube.com/@mkbhd'],
    ['random text', 'not a url'],
    ['short bare id', 'abc'],
    ['null', null as unknown as string],
  ])('returns null for %s', (_label, input) => {
    expect(extractVideoId(input)).toBeNull();
  });
});

describe('parseIsoDurationSeconds', () => {
  it.each([
    ['hours minutes seconds', 'PT1H2M3S', 3723],
    ['minutes seconds', 'PT5M30S', 330],
    ['seconds only', 'PT45S', 45],
    ['hours only', 'PT2H', 7200],
    ['minutes only', 'PT10M', 600],
  ])('parses %s', (_label, input, expected) => {
    expect(parseIsoDurationSeconds(input)).toBe(expected);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['zero duration', 'PT0S'],
    ['malformed', 'P1Y2M'],
    ['random text', 'five minutes'],
  ])('returns null for %s', (_label, input) => {
    expect(parseIsoDurationSeconds(input)).toBeNull();
  });
});
