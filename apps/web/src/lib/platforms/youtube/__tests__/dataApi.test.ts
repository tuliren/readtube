import { MembersOnlyVideoError } from '@/lib/platforms/types';

import {
  fetchChannelViaDataApi,
  fetchPlaylistViaDataApi,
  fetchVideoViaDataApi,
  isDataApiConfigured,
} from '../dataApi';

const CHANNEL_ID = 'UCBJycsmduvYEL83R_U4JriQ';
const UPLOADS_PLAYLIST_ID = `UU${CHANNEL_ID.slice(2)}`;
const SHORTS_PLAYLIST_ID = `UUSH${CHANNEL_ID.slice(2)}`;
const MEMBERS_PLAYLIST_ID = `UUMO${CHANNEL_ID.slice(2)}`;
const VIDEO_ID = 'dQw4w9WgXcQ';
const SHORT_ID = 'shortvideo1';

type JsonBody = Record<string, unknown>;

/**
 * Install a fetch mock that dispatches on the Data API resource path
 * and returns the given JSON bodies. Non-listed resources throw.
 * Each handler value may also be a number, which is served as an
 * HTTP error with that status.
 */
function mockDataApi(handlers: Record<string, JsonBody | number | ((url: URL) => JsonBody)>) {
  (globalThis.fetch as jest.Mock).mockImplementation((rawUrl: string) => {
    const url = new URL(rawUrl);
    for (const [matcher, handler] of Object.entries(handlers)) {
      const [resource, requiredParam] = matcher.split('|');
      if (!url.pathname.endsWith(`/youtube/v3/${resource}`)) {
        continue;
      }
      if (requiredParam != null) {
        const [param, value] = requiredParam.split('=');
        if (url.searchParams.get(param) !== value) {
          continue;
        }
      }
      if (typeof handler === 'number') {
        return Promise.resolve({
          ok: false,
          status: handler,
          text: async () => JSON.stringify({ error: { code: handler } }),
        });
      }
      const body = typeof handler === 'function' ? handler(url) : handler;
      return Promise.resolve({ ok: true, json: async () => body });
    }
    throw new Error(`Unexpected fetch URL: ${rawUrl}`);
  });
}

function buildChannelsResponse(overrides?: { customUrl?: string }): JsonBody {
  return {
    items: [
      {
        id: CHANNEL_ID,
        snippet: {
          title: 'Marques Brownlee',
          customUrl: overrides?.customUrl ?? '@mkbhd',
          thumbnails: { high: { url: 'https://yt3.googleusercontent.com/logo=s800' } },
        },
        contentDetails: { relatedPlaylists: { uploads: UPLOADS_PLAYLIST_ID } },
      },
    ],
  };
}

function buildPlaylistItem(videoId: string, privacyStatus = 'public'): JsonBody {
  return { contentDetails: { videoId }, status: { privacyStatus } };
}

function buildVideoItem(
  videoId: string,
  overrides?: {
    duration?: string;
    liveBroadcastContent?: string;
    publishedAt?: string;
  }
): JsonBody {
  return {
    id: videoId,
    snippet: {
      title: `Video ${videoId}`,
      description: `Description of ${videoId}`,
      publishedAt: overrides?.publishedAt ?? '2024-06-01T00:00:00Z',
      channelId: CHANNEL_ID,
      channelTitle: 'Marques Brownlee',
      liveBroadcastContent: overrides?.liveBroadcastContent ?? 'none',
      thumbnails: { high: { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` } },
    },
    contentDetails: { duration: overrides?.duration ?? 'PT10M30S' },
  };
}

describe('isDataApiConfigured', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it.each([
    ['set', 'yt-key', true],
    ['empty', '', false],
    ['whitespace', '  ', false],
    ['unset', undefined, false],
  ])('returns %s → %s', (_label, value, expected) => {
    process.env = { ...originalEnv };
    delete process.env.YOUTUBE_API_KEY;
    if (value != null) {
      process.env.YOUTUBE_API_KEY = value;
    }
    expect(isDataApiConfigured()).toBe(expected);
  });
});

describe('fetchChannelViaDataApi', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, YOUTUBE_API_KEY: 'yt-key' };
    jest.spyOn(globalThis, 'fetch');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('builds a full snapshot from channels + playlistItems + videos', async () => {
    mockDataApi({
      channels: buildChannelsResponse(),
      [`playlistItems|playlistId=${UPLOADS_PLAYLIST_ID}`]: {
        items: [buildPlaylistItem(VIDEO_ID), buildPlaylistItem(SHORT_ID)],
      },
      [`playlistItems|playlistId=${SHORTS_PLAYLIST_ID}`]: {
        items: [buildPlaylistItem(SHORT_ID)],
      },
      videos: {
        items: [buildVideoItem(VIDEO_ID), buildVideoItem(SHORT_ID, { duration: 'PT2M' })],
      },
    });

    const snapshot = await fetchChannelViaDataApi({ channelId: CHANNEL_ID });

    expect(snapshot.channelId).toBe(CHANNEL_ID);
    expect(snapshot.name).toBe('Marques Brownlee');
    expect(snapshot.handle).toBe('@mkbhd');
    expect(snapshot.logoUrl).toBe('https://yt3.googleusercontent.com/logo=s800');
    // The short is excluded via the shorts playlist even though its
    // 2-minute duration is above the fallback threshold.
    expect(snapshot.videos.map((v) => v.videoId)).toEqual([VIDEO_ID]);
    expect(snapshot.videos[0]).toEqual({
      videoId: VIDEO_ID,
      title: `Video ${VIDEO_ID}`,
      description: `Description of ${VIDEO_ID}`,
      publishedAt: new Date('2024-06-01T00:00:00Z'),
      link: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      durationSeconds: 630,
    });
  });

  it('resolves an @handle via forHandle without any scrape', async () => {
    mockDataApi({
      'channels|forHandle=@mkbhd': buildChannelsResponse(),
      [`playlistItems|playlistId=${UPLOADS_PLAYLIST_ID}`]: { items: [] },
    });

    const snapshot = await fetchChannelViaDataApi({ handle: '@mkbhd' });

    expect(snapshot.channelId).toBe(CHANNEL_ID);
    expect(snapshot.videos).toEqual([]);
  });

  it.each([
    ['live', 'live'],
    ['upcoming premiere', 'upcoming'],
  ])('drops %s broadcasts', async (_label, liveBroadcastContent) => {
    mockDataApi({
      channels: buildChannelsResponse(),
      [`playlistItems|playlistId=${UPLOADS_PLAYLIST_ID}`]: {
        items: [buildPlaylistItem(VIDEO_ID), buildPlaylistItem('livevideo01')],
      },
      [`playlistItems|playlistId=${SHORTS_PLAYLIST_ID}`]: { items: [] },
      videos: {
        items: [buildVideoItem(VIDEO_ID), buildVideoItem('livevideo01', { liveBroadcastContent })],
      },
    });

    const snapshot = await fetchChannelViaDataApi({ channelId: CHANNEL_ID });

    expect(snapshot.videos.map((v) => v.videoId)).toEqual([VIDEO_ID]);
  });

  it('drops non-public playlist entries without querying them', async () => {
    mockDataApi({
      channels: buildChannelsResponse(),
      [`playlistItems|playlistId=${UPLOADS_PLAYLIST_ID}`]: {
        items: [
          buildPlaylistItem(VIDEO_ID),
          buildPlaylistItem('privatevid1', 'private'),
          buildPlaylistItem('unlistedvi1', 'unlisted'),
        ],
      },
      [`playlistItems|playlistId=${SHORTS_PLAYLIST_ID}`]: { items: [] },
      videos: (url) => {
        expect(url.searchParams.get('id')).toBe(VIDEO_ID);
        return { items: [buildVideoItem(VIDEO_ID)] };
      },
    });

    const snapshot = await fetchChannelViaDataApi({ channelId: CHANNEL_ID });

    expect(snapshot.videos.map((v) => v.videoId)).toEqual([VIDEO_ID]);
  });

  it('treats a 404 shorts playlist as "channel has no Shorts"', async () => {
    mockDataApi({
      channels: buildChannelsResponse(),
      [`playlistItems|playlistId=${UPLOADS_PLAYLIST_ID}`]: {
        items: [buildPlaylistItem(VIDEO_ID)],
      },
      [`playlistItems|playlistId=${SHORTS_PLAYLIST_ID}`]: 404,
      videos: { items: [buildVideoItem(VIDEO_ID, { duration: 'PT2M' })] },
    });

    const snapshot = await fetchChannelViaDataApi({ channelId: CHANNEL_ID });

    expect(snapshot.videos.map((v) => v.videoId)).toEqual([VIDEO_ID]);
  });

  it('falls back to the ≤60s duration heuristic when the shorts playlist fetch fails', async () => {
    mockDataApi({
      channels: buildChannelsResponse(),
      [`playlistItems|playlistId=${UPLOADS_PLAYLIST_ID}`]: {
        items: [buildPlaylistItem(VIDEO_ID), buildPlaylistItem(SHORT_ID)],
      },
      [`playlistItems|playlistId=${SHORTS_PLAYLIST_ID}`]: 500,
      videos: {
        items: [buildVideoItem(VIDEO_ID), buildVideoItem(SHORT_ID, { duration: 'PT45S' })],
      },
    });

    const snapshot = await fetchChannelViaDataApi({ channelId: CHANNEL_ID });

    expect(snapshot.videos.map((v) => v.videoId)).toEqual([VIDEO_ID]);
  });

  it('drops future-dated videos', async () => {
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    mockDataApi({
      channels: buildChannelsResponse(),
      [`playlistItems|playlistId=${UPLOADS_PLAYLIST_ID}`]: {
        items: [buildPlaylistItem(VIDEO_ID), buildPlaylistItem('futurevideo')],
      },
      [`playlistItems|playlistId=${SHORTS_PLAYLIST_ID}`]: { items: [] },
      videos: {
        items: [buildVideoItem(VIDEO_ID), buildVideoItem('futurevideo', { publishedAt: future })],
      },
    });

    const snapshot = await fetchChannelViaDataApi({ channelId: CHANNEL_ID });

    expect(snapshot.videos.map((v) => v.videoId)).toEqual([VIDEO_ID]);
  });

  it('returns null handle for a legacy custom URL without @', async () => {
    mockDataApi({
      channels: buildChannelsResponse({ customUrl: 'marquesbrownlee' }),
      [`playlistItems|playlistId=${UPLOADS_PLAYLIST_ID}`]: { items: [] },
    });

    const snapshot = await fetchChannelViaDataApi({ channelId: CHANNEL_ID });

    expect(snapshot.handle).toBeNull();
  });

  it('throws when the channel does not exist', async () => {
    mockDataApi({ channels: { items: [] } });

    await expect(fetchChannelViaDataApi({ channelId: CHANNEL_ID })).rejects.toThrow(
      'returned no channel'
    );
  });

  it('throws when YOUTUBE_API_KEY is not set', async () => {
    delete process.env.YOUTUBE_API_KEY;

    await expect(fetchChannelViaDataApi({ channelId: CHANNEL_ID })).rejects.toThrow(
      'YOUTUBE_API_KEY is not set'
    );
  });

  it('throws when neither channelId nor handle is provided', async () => {
    await expect(fetchChannelViaDataApi({})).rejects.toThrow('requires a channelId or handle');
  });
});

describe('fetchVideoViaDataApi', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, YOUTUBE_API_KEY: 'yt-key' };
    jest.spyOn(globalThis, 'fetch');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('builds a snapshot with channel handle and logo enrichment', async () => {
    mockDataApi({
      videos: { items: [buildVideoItem(VIDEO_ID)] },
      channels: buildChannelsResponse(),
      [`playlistItems|playlistId=${MEMBERS_PLAYLIST_ID}`]: 404,
    });

    const snapshot = await fetchVideoViaDataApi(VIDEO_ID);

    expect(snapshot).toEqual({
      videoId: VIDEO_ID,
      title: `Video ${VIDEO_ID}`,
      description: `Description of ${VIDEO_ID}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      publishedAt: new Date('2024-06-01T00:00:00Z'),
      durationSeconds: 630,
      channel: {
        sourceId: CHANNEL_ID,
        name: 'Marques Brownlee',
        handle: '@mkbhd',
        logoUrl: 'https://yt3.googleusercontent.com/logo=s800',
      },
    });
  });

  it('degrades handle and logo to null when channel enrichment fails', async () => {
    mockDataApi({
      videos: { items: [buildVideoItem(VIDEO_ID)] },
      channels: 500,
      [`playlistItems|playlistId=${MEMBERS_PLAYLIST_ID}`]: 404,
    });

    const snapshot = await fetchVideoViaDataApi(VIDEO_ID);

    expect(snapshot.channel).toEqual({
      sourceId: CHANNEL_ID,
      name: 'Marques Brownlee',
      handle: null,
      logoUrl: null,
    });
  });

  it('throws MembersOnlyVideoError when the video is in the members-only playlist', async () => {
    mockDataApi({
      videos: { items: [buildVideoItem(VIDEO_ID)] },
      channels: buildChannelsResponse(),
      [`playlistItems|playlistId=${MEMBERS_PLAYLIST_ID}`]: {
        items: [{ id: 'members-playlist-item' }],
      },
    });

    await expect(fetchVideoViaDataApi(VIDEO_ID)).rejects.toThrow(MembersOnlyVideoError);
  });

  it.each([
    ['playlist does not exist (channel has no members content)', 404],
    ['check fails transiently', 500],
  ])('treats the video as addable when the members-only %s', async (_label, status) => {
    mockDataApi({
      videos: { items: [buildVideoItem(VIDEO_ID)] },
      channels: buildChannelsResponse(),
      [`playlistItems|playlistId=${MEMBERS_PLAYLIST_ID}`]: status,
    });

    const snapshot = await fetchVideoViaDataApi(VIDEO_ID);

    expect(snapshot.videoId).toBe(VIDEO_ID);
  });

  it('throws when the video does not exist', async () => {
    mockDataApi({ videos: { items: [] } });

    await expect(fetchVideoViaDataApi(VIDEO_ID)).rejects.toThrow('returned no video');
  });

  it('throws when YOUTUBE_API_KEY is not set', async () => {
    delete process.env.YOUTUBE_API_KEY;

    await expect(fetchVideoViaDataApi(VIDEO_ID)).rejects.toThrow('YOUTUBE_API_KEY is not set');
  });
});

describe('fetchPlaylistViaDataApi', () => {
  const originalEnv = process.env;
  const PLAYLIST_ID = 'PLtestplaylist12';

  beforeEach(() => {
    process.env = { ...originalEnv, YOUTUBE_API_KEY: 'yt-key' };
    jest.spyOn(globalThis, 'fetch');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  function buildPlaylistEntry(videoId: string, privacyStatus = 'public'): JsonBody {
    return {
      snippet: {
        title: `Item ${videoId}`,
        description: `Item desc ${videoId}`,
        videoOwnerChannelId: 'UCowner0000000000000000',
        videoOwnerChannelTitle: 'Owner From Item',
      },
      contentDetails: { videoId, videoPublishedAt: '2024-05-01T00:00:00Z' },
      status: { privacyStatus },
    };
  }

  it('builds a playlist with durations, publish dates, and per-video uploader channels', async () => {
    mockDataApi({
      playlists: {
        items: [
          {
            id: PLAYLIST_ID,
            snippet: {
              title: 'My Curated List',
              channelId: CHANNEL_ID,
              channelTitle: 'Playlist Owner',
            },
          },
        ],
      },
      [`playlistItems|playlistId=${PLAYLIST_ID}`]: {
        items: [
          buildPlaylistEntry(VIDEO_ID),
          buildPlaylistEntry(SHORT_ID),
          buildPlaylistEntry('privatevid1', 'private'),
          buildPlaylistEntry('upcomingvi1'),
        ],
      },
      videos: {
        items: [
          buildVideoItem(VIDEO_ID),
          buildVideoItem(SHORT_ID, { duration: 'PT45S' }),
          buildVideoItem('upcomingvi1', { liveBroadcastContent: 'upcoming' }),
        ],
      },
    });

    const playlist = await fetchPlaylistViaDataApi(PLAYLIST_ID);

    expect(playlist.title).toBe('My Curated List');
    expect(playlist.channelId).toBe(CHANNEL_ID);
    expect(playlist.channelName).toBe('Playlist Owner');
    // Short (≤60s), private entry, and upcoming broadcast are dropped.
    expect(playlist.videos.map((v) => v.videoId)).toEqual([VIDEO_ID]);
    expect(playlist.videos[0]).toEqual({
      videoId: VIDEO_ID,
      title: `Video ${VIDEO_ID}`,
      description: `Description of ${VIDEO_ID}`,
      publishedAt: new Date('2024-06-01T00:00:00Z'),
      thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      durationSeconds: 630,
      // Uploader from videos.list, not the playlist owner.
      channelId: CHANNEL_ID,
      channelName: 'Marques Brownlee',
    });
  });

  it('returns an empty video list for an empty playlist without calling videos.list', async () => {
    mockDataApi({
      playlists: {
        items: [
          {
            id: PLAYLIST_ID,
            snippet: { title: 'Empty', channelId: CHANNEL_ID, channelTitle: 'Owner' },
          },
        ],
      },
      [`playlistItems|playlistId=${PLAYLIST_ID}`]: { items: [] },
    });

    const playlist = await fetchPlaylistViaDataApi(PLAYLIST_ID);

    expect(playlist.videos).toEqual([]);
  });

  it('throws when the playlist is invisible to the API (private, Mix, or nonexistent)', async () => {
    mockDataApi({ playlists: { items: [] } });

    await expect(fetchPlaylistViaDataApi(PLAYLIST_ID)).rejects.toThrow('returned no playlist');
  });
});
