import {
  buildPlaylistRssUrl,
  buildRssUrl,
  buildThumbnailUrl,
  extractChannelId,
  extractHandle,
  extractPlaylistId,
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
    ['protocol-less channel URL', `youtube.com/channel/${VALID_CHANNEL_ID}`, VALID_CHANNEL_ID],
    [
      'protocol-less channel URL with www',
      `www.youtube.com/channel/${VALID_CHANNEL_ID}`,
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
    ['protocol-less handle URL', 'youtube.com/@somehandle', 'somehandle'],
    ['protocol-less handle URL with www', 'www.youtube.com/@mkbhd', 'mkbhd'],
    ['handle with dots', 'https://youtube.com/@some.channel.123', 'some.channel.123'],
    [
      'Cyrillic handle',
      'https://youtube.com/@БОРИСБОЯРШИНОВСОДНАНАУКИ',
      'БОРИСБОЯРШИНОВСОДНАНАУКИ',
    ],
    ['CJK handle', 'https://www.youtube.com/@中文频道', '中文频道'],
    [
      'percent-encoded Cyrillic handle',
      'https://youtube.com/@%D0%91%D0%9E%D0%A0%D0%98%D0%A1',
      'БОРИС',
    ],
    ['mixed-script handle', 'https://youtube.com/@user_中文_123', 'user_中文_123'],
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

const VALID_PLAYLIST_ID = 'PL5Nnuy0hm7urlZC8j4UgBwTHZS-qUL9iW';

describe('extractPlaylistId', () => {
  it.each([
    ['bare playlist ID', VALID_PLAYLIST_ID, VALID_PLAYLIST_ID],
    [
      '/playlist?list= URL',
      `https://www.youtube.com/playlist?list=${VALID_PLAYLIST_ID}`,
      VALID_PLAYLIST_ID,
    ],
    [
      '/watch?v=...&list= URL',
      `https://www.youtube.com/watch?v=qE_Al_GcV9M&list=${VALID_PLAYLIST_ID}`,
      VALID_PLAYLIST_ID,
    ],
    [
      'playlist URL without www',
      `https://youtube.com/playlist?list=${VALID_PLAYLIST_ID}`,
      VALID_PLAYLIST_ID,
    ],
    [
      'protocol-less playlist URL',
      `youtube.com/playlist?list=${VALID_PLAYLIST_ID}`,
      VALID_PLAYLIST_ID,
    ],
    [
      'protocol-less /watch with list',
      `www.youtube.com/watch?v=qE_Al_GcV9M&list=${VALID_PLAYLIST_ID}`,
      VALID_PLAYLIST_ID,
    ],
  ])('extracts playlist ID from %s', (_label, input, expected) => {
    expect(extractPlaylistId(input)).toBe(expected);
  });

  it.each([
    ['channel URL', `https://youtube.com/channel/${VALID_CHANNEL_ID}`],
    ['watch URL without list', 'https://youtube.com/watch?v=abc123'],
    ['non-youtube URL', 'https://vimeo.com/playlist?list=PL123456789abc'],
    ['empty string', ''],
    ['null', null as unknown as string],
    ['random text', 'not a url'],
    ['short bare id', 'PLabc'],
  ])('returns null for %s', (_label, input) => {
    expect(extractPlaylistId(input)).toBeNull();
  });
});

describe('buildPlaylistRssUrl', () => {
  it('builds correct playlist RSS URL', () => {
    expect(buildPlaylistRssUrl(VALID_PLAYLIST_ID)).toBe(
      `https://www.youtube.com/feeds/videos.xml?playlist_id=${VALID_PLAYLIST_ID}`
    );
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
