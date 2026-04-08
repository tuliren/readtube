import { buildRssUrl, extractChannelId } from '../youtube/channelUrl';

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
    ['handle URL', 'https://youtube.com/@MrBeast'],
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

describe('buildRssUrl', () => {
  it('builds correct RSS URL', () => {
    expect(buildRssUrl(VALID_CHANNEL_ID)).toBe(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${VALID_CHANNEL_ID}`
    );
  });
});
