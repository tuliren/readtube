import {
  type AddKind,
  type AddPlatform,
  describeAddTarget,
  detectAddTarget,
} from '../detectAddTarget';

const VIDEO_ID = 'abcdefghijk';
const PLAYLIST_ID = 'PLabcdefghijklmnop';
const CHANNEL_ID = 'UCabcdefghijklmnopqrstuv';
const BVID = 'BV1abcdefghi';

describe('detectAddTarget', () => {
  it.each<[string, string, AddKind, AddPlatform]>([
    ['YouTube @handle URL', 'https://www.youtube.com/@examplecreator', 'channel', 'youtube'],
    ['YouTube @handle URL without scheme', 'youtube.com/@examplecreator', 'channel', 'youtube'],
    ['YouTube /channel URL', `https://youtube.com/channel/${CHANNEL_ID}`, 'channel', 'youtube'],
    ['bare UC channel id', CHANNEL_ID, 'channel', 'youtube'],
    ['Bilibili space URL', 'https://space.bilibili.com/12345678', 'channel', 'bilibili'],
    ['bare Bilibili mid', '12345678', 'channel', 'bilibili'],
    ['YouTube watch URL', `https://www.youtube.com/watch?v=${VIDEO_ID}`, 'video', 'youtube'],
    ['youtu.be short link', `https://youtu.be/${VIDEO_ID}`, 'video', 'youtube'],
    ['YouTube shorts URL', `youtube.com/shorts/${VIDEO_ID}`, 'video', 'youtube'],
    ['bare YouTube video id', VIDEO_ID, 'video', 'youtube'],
    ['Bilibili video URL', `https://www.bilibili.com/video/${BVID}/`, 'video', 'bilibili'],
    ['bare BV id', BVID, 'video', 'bilibili'],
    [
      'YouTube playlist URL',
      `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`,
      'playlist',
      'youtube',
    ],
    ['bare playlist id', PLAYLIST_ID, 'playlist', 'youtube'],
  ])('classifies a %s', (_label, input, kind, platform) => {
    const detection = detectAddTarget(input);
    expect(detection?.primary.kind).toBe(kind);
    expect(detection?.primary.platform).toBe(platform);
    expect(detection?.primary.url).toBe(input.trim());
  });

  it('expands a bare @handle into a YouTube channel URL', () => {
    expect(detectAddTarget('  @examplecreator ')).toEqual({
      primary: {
        kind: 'channel',
        platform: 'youtube',
        url: 'https://www.youtube.com/@examplecreator',
      },
      alternatives: [],
    });
  });

  it('prefers the video for a watch URL inside a playlist, offering the playlist too', () => {
    const input = `https://www.youtube.com/watch?v=${VIDEO_ID}&list=${PLAYLIST_ID}`;
    expect(detectAddTarget(input)).toEqual({
      primary: { kind: 'video', platform: 'youtube', url: input },
      alternatives: [{ kind: 'playlist', platform: 'youtube', url: input }],
    });
  });

  it('offers a YouTube video reading for an 11-digit id', () => {
    const input = '12345678901';
    expect(detectAddTarget(input)).toEqual({
      primary: { kind: 'channel', platform: 'bilibili', url: input },
      alternatives: [{ kind: 'video', platform: 'youtube', url: input }],
    });
  });

  it.each([
    ['empty input', ''],
    ['whitespace', '   '],
    ['an unrelated site', 'https://example.com/watch?v=abcdefghijk'],
    ['a YouTube page that names no entity', 'https://www.youtube.com/feed/subscriptions'],
    ['a short number', '123'],
    ['plain words', 'hello world'],
  ])('returns null for %s', (_label, input) => {
    expect(detectAddTarget(input)).toBeNull();
  });
});

describe('describeAddTarget', () => {
  it.each<[AddKind, AddPlatform, string]>([
    ['channel', 'youtube', 'YouTube channel'],
    ['video', 'bilibili', 'Bilibili video'],
    ['playlist', 'youtube', 'YouTube playlist'],
  ])('labels a %s on %s', (kind, platform, expected) => {
    expect(describeAddTarget({ kind, platform })).toBe(expected);
  });
});
