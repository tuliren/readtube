import {
  buildBilibiliSpaceUrl,
  buildBilibiliVideoUrl,
  extractBilibiliChannelMid,
  extractBilibiliVideoId,
} from '../urls';

const VALID_BVID = 'BV1DgdhBGEq2';

describe('extractBilibiliVideoId', () => {
  it.each([
    ['bare BV id', VALID_BVID, VALID_BVID],
    ['canonical URL', `https://www.bilibili.com/video/${VALID_BVID}/`, VALID_BVID],
    ['canonical URL without www', `https://bilibili.com/video/${VALID_BVID}`, VALID_BVID],
    [
      'URL with query params',
      `https://www.bilibili.com/video/${VALID_BVID}?spm_id_from=foo`,
      VALID_BVID,
    ],
    ['uppercased host', `https://WWW.BILIBILI.COM/video/${VALID_BVID}`, VALID_BVID],
  ])('extracts the BV id from %s', (_label, input, expected) => {
    expect(extractBilibiliVideoId(input)).toBe(expected);
  });

  it.each([
    ['empty string', ''],
    ['random text', 'not a url'],
    ['whitespace', '   '],
    ['YouTube URL', 'https://youtube.com/watch?v=dQw4w9WgXcQ'],
    ['bilibili URL without /video/', 'https://www.bilibili.com/read/mobile/42'],
    ['too-short BV id', 'BV1'],
    ['null-like', null as unknown as string],
  ])('returns null for %s', (_label, input) => {
    expect(extractBilibiliVideoId(input)).toBeNull();
  });
});

describe('buildBilibiliVideoUrl', () => {
  it('builds a canonical watch-page URL from a BV id', () => {
    expect(buildBilibiliVideoUrl(VALID_BVID)).toBe(`https://www.bilibili.com/video/${VALID_BVID}/`);
  });
});

describe('buildBilibiliSpaceUrl', () => {
  it('builds a space URL from a mid', () => {
    expect(buildBilibiliSpaceUrl('12345')).toBe('https://space.bilibili.com/12345');
  });
});

describe('extractBilibiliChannelMid', () => {
  it.each([
    ['bare numeric mid', '946974', '946974'],
    ['space root URL', 'https://space.bilibili.com/946974', '946974'],
    ['space root with trailing slash', 'https://space.bilibili.com/946974/', '946974'],
    ['upload/video sub-path', 'https://space.bilibili.com/946974/upload/video', '946974'],
    ['dynamic sub-path', 'https://space.bilibili.com/946974/dynamic', '946974'],
    ['uppercased host', 'https://SPACE.BILIBILI.COM/946974', '946974'],
    ['URL with query', 'https://space.bilibili.com/946974?foo=bar', '946974'],
    ['URL with whitespace', '   https://space.bilibili.com/946974   ', '946974'],
  ])('extracts the mid from %s', (_label, input, expected) => {
    expect(extractBilibiliChannelMid(input)).toBe(expected);
  });

  it.each([
    ['empty string', ''],
    ['whitespace', '   '],
    ['random text', 'not a url'],
    ['numeric too short', '123'],
    ['non-space bilibili URL', 'https://www.bilibili.com/video/BV1DgdhBGEq2'],
    ['YouTube URL', 'https://youtube.com/@mkbhd'],
    ['null-like', null as unknown as string],
  ])('returns null for %s', (_label, input) => {
    expect(extractBilibiliChannelMid(input)).toBeNull();
  });
});
