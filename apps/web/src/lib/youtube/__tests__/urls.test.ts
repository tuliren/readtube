import {
  buildRssUrl,
  buildThumbnailUrl,
  extractChannelId,
  extractHandle,
  resizeGoogleAvatar,
} from '../urls';

const VALID_CHANNEL_ID = 'UCVHFbw7woebytA3UMoHJSNw';

describe('extractChannelId', () => {
  it.each([
    ['bare channel ID', VALID_CHANNEL_ID, VALID_CHANNEL_ID],
    ['channel URL', `https://youtube.com/channel/${VALID_CHANNEL_ID}`, VALID_CHANNEL_ID],
    [
      'channel URL with www',
      `https://www.youtube.com/channel/${VALID_CHANNEL_ID}`,
      VALID_CHANNEL_ID,
    ],
    [
      'channel URL with trailing slash',
      `https://youtube.com/channel/${VALID_CHANNEL_ID}/`,
      VALID_CHANNEL_ID,
    ],
  ])('extracts channel ID from %s', (_label, input, expected) => {
    expect(extractChannelId(input)).toBe(expected);
  });

  it.each([
    ['watch URL', 'https://youtube.com/watch?v=abc123'],
    ['non-youtube URL', 'https://vimeo.com/channel/UC123'],
    ['empty string', ''],
    ['random text', 'not a url'],
    ['null-like', null as unknown as string],
    ['short channel ID', 'UCabc'],
  ])('returns null for %s', (_label, input) => {
    expect(extractChannelId(input)).toBeNull();
  });
});

describe('extractHandle', () => {
  it.each([
    ['handle URL', 'https://youtube.com/@MrBeast', 'MrBeast'],
    ['handle URL with www', 'https://www.youtube.com/@HealthyGamerGG', 'HealthyGamerGG'],
    ['handle with dots', 'https://youtube.com/@some.channel.123', 'some.channel.123'],
  ])('extracts handle from %s', (_label, input, expected) => {
    expect(extractHandle(input)).toBe(expected);
  });

  it.each([
    ['channel URL', `https://youtube.com/channel/${VALID_CHANNEL_ID}`],
    ['bare channel ID', VALID_CHANNEL_ID],
    ['non-youtube URL', 'https://vimeo.com/@handle'],
    ['empty string', ''],
  ])('returns null for %s', (_label, input) => {
    expect(extractHandle(input)).toBeNull();
  });
});

describe('buildRssUrl', () => {
  it('builds correct RSS URL', () => {
    expect(buildRssUrl(VALID_CHANNEL_ID)).toBe(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${VALID_CHANNEL_ID}`
    );
  });
});

describe('buildThumbnailUrl', () => {
  it.each([
    ['dQw4w9WgXcQ', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'],
    ['abc123', 'https://i.ytimg.com/vi/abc123/hqdefault.jpg'],
  ])('builds thumbnail URL for %s', (videoId, expected) => {
    expect(buildThumbnailUrl(videoId)).toBe(expected);
  });
});

describe('resizeGoogleAvatar', () => {
  it.each([
    {
      name: 'rewrites =sN token',
      input: 'https://yt3.googleusercontent.com/abc=s900-c-k-c0x00ffffff-no-rj',
      size: 40,
      expected: 'https://yt3.googleusercontent.com/abc=s40-c-k-c0x00ffffff-no-rj',
    },
    {
      name: 'returns unchanged when no =sN token is present',
      input: 'https://example.com/logo.png',
      size: 40,
      expected: 'https://example.com/logo.png',
    },
  ])('$name', ({ input, size, expected }) => {
    expect(resizeGoogleAvatar(input, size)).toBe(expected);
  });
});
