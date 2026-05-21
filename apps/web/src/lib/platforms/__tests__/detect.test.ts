import { VideoPlatformType } from '@readtube/database';

import { BilibiliPlatform, YouTubePlatform, detectPlatform, getPlatformByType } from '..';

describe('detectPlatform', () => {
  it.each([
    ['YouTube watch URL', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', VideoPlatformType.YOUTUBE],
    ['youtu.be short URL', 'https://youtu.be/dQw4w9WgXcQ', VideoPlatformType.YOUTUBE],
    ['bare 11-char YouTube id', 'dQw4w9WgXcQ', VideoPlatformType.YOUTUBE],
    ['protocol-less YouTube handle URL', 'youtube.com/@mreflow', VideoPlatformType.YOUTUBE],
    ['protocol-less youtu.be URL', 'youtu.be/dQw4w9WgXcQ', VideoPlatformType.YOUTUBE],
    ['Bilibili URL', 'https://www.bilibili.com/video/BV1DgdhBGEq2/', VideoPlatformType.BILIBILI],
    ['bare BV id', 'BV1DgdhBGEq2', VideoPlatformType.BILIBILI],
    ['protocol-less Bilibili URL', 'bilibili.com/video/BV1DgdhBGEq2', VideoPlatformType.BILIBILI],
  ])('dispatches %s to the right platform', (_label, input, expected) => {
    expect(detectPlatform(input)?.type).toBe(expected);
  });

  it.each([
    ['empty string', ''],
    ['random text', 'not a url'],
    ['unrecognized host', 'https://vimeo.com/12345'],
  ])('returns null for %s', (_label, input) => {
    expect(detectPlatform(input)).toBeNull();
  });
});

describe('getPlatformByType', () => {
  it.each([
    [VideoPlatformType.YOUTUBE, YouTubePlatform],
    [VideoPlatformType.BILIBILI, BilibiliPlatform],
  ])('returns a %s platform instance', (type, cls) => {
    const platform = getPlatformByType(type);
    expect(platform.type).toBe(type);
    expect(platform).toBeInstanceOf(cls);
  });
});
