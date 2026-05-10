import { fetchChannelLatest, resolveChannelId } from '../transcriptApi';

describe('fetchChannelLatest', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, TRANSCRIPT_API_KEY: 'test-key' };
    jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('throws when TRANSCRIPT_API_KEY is not set', async () => {
    delete process.env.TRANSCRIPT_API_KEY;

    await expect(fetchChannelLatest('UC_test')).rejects.toThrow('TRANSCRIPT_API_KEY is not set');
  });

  it('returns channel metadata and mapped videos on success', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        channel: {
          channelId: 'UC_abc',
          title: 'Test Channel',
          author: 'Test',
          url: 'https://youtube.com/channel/UC_abc',
          published: '2020-01-01T00:00:00Z',
        },
        results: [
          {
            videoId: 'vid_1',
            title: 'Video One',
            channelId: 'UC_abc',
            author: 'Test',
            published: '2026-01-15T12:00:00Z',
            updated: '2026-01-15T13:00:00Z',
            link: 'https://youtube.com/watch?v=vid_1',
            description: 'A description',
            thumbnail: {
              url: 'https://i.ytimg.com/vi/vid_1/hqdefault.jpg',
              width: '480',
              height: '360',
            },
            viewCount: '1000',
            starRating: { count: '50', average: '4.8', min: '1', max: '5' },
          },
          {
            videoId: 'vid_2',
            title: 'Video Two',
            channelId: 'UC_abc',
            author: 'Test',
            published: '2026-01-10T00:00:00Z',
            updated: '2026-01-10T01:00:00Z',
            link: 'https://youtube.com/watch?v=vid_2',
            description: null,
            thumbnail: {
              url: 'https://i.ytimg.com/vi/vid_2/hqdefault.jpg',
              width: '480',
              height: '360',
            },
            viewCount: '500',
            starRating: { count: '10', average: '4.5', min: '1', max: '5' },
          },
        ],
      }),
    });

    const result = await fetchChannelLatest('UC_abc');

    expect(result.channel).toEqual({ channelId: 'UC_abc', title: 'Test Channel' });
    expect(result.videos).toHaveLength(2);
    expect(result.videos[0]).toEqual({
      videoId: 'vid_1',
      title: 'Video One',
      description: 'A description',
      publishedAt: new Date('2026-01-15T12:00:00Z'),
      thumbnailUrl: 'https://i.ytimg.com/vi/vid_1/hqdefault.jpg',
      link: 'https://youtube.com/watch?v=vid_1',
    });
    // null description maps to empty string
    expect(result.videos[1]!.description).toBe('');
  });

  it('sends correct URL and auth header', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        channel: { channelId: 'UC_x', title: 'X', author: 'X', url: '', published: '' },
        results: [],
      }),
    });

    await fetchChannelLatest('@TestHandle');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://transcriptapi.com/api/v2/youtube/channel/latest?channel=%40TestHandle',
      { headers: { Authorization: 'Bearer test-key' }, cache: 'no-store' }
    );
  });

  it('throws on non-OK response with status and body', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });

    await expect(fetchChannelLatest('UC_test')).rejects.toThrow(
      'TranscriptAPI /channel/latest 429: rate limited'
    );
  });

  it('handles missing results gracefully', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        channel: { channelId: 'UC_empty', title: 'Empty', author: '', url: '', published: '' },
        results: undefined,
      }),
    });

    const result = await fetchChannelLatest('UC_empty');

    expect(result.videos).toEqual([]);
  });

  it('skips entries whose published date is in the future', async () => {
    const futurePublished = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        channel: { channelId: 'UC_abc', title: 'Test', author: '', url: '', published: '' },
        results: [
          {
            videoId: 'past_video',
            title: 'Aired',
            channelId: 'UC_abc',
            author: 'Test',
            published: '2026-01-01T00:00:00Z',
            updated: '',
            link: 'https://youtube.com/watch?v=past_video',
            description: '',
            thumbnail: { url: '', width: '', height: '' },
            viewCount: '0',
            starRating: { count: '0', average: '0', min: '1', max: '5' },
          },
          {
            videoId: 'upcoming_stream',
            title: 'Scheduled live',
            channelId: 'UC_abc',
            author: 'Test',
            published: futurePublished,
            updated: '',
            link: 'https://youtube.com/watch?v=upcoming_stream',
            description: '',
            thumbnail: { url: '', width: '', height: '' },
            viewCount: '0',
            starRating: { count: '0', average: '0', min: '1', max: '5' },
          },
        ],
      }),
    });

    const result = await fetchChannelLatest('UC_abc');

    expect(result.videos.map((v) => v.videoId)).toEqual(['past_video']);
  });

  it('handles missing thumbnail gracefully', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        channel: {
          channelId: 'UC_no_thumb',
          title: 'No Thumb',
          author: '',
          url: '',
          published: '',
        },
        results: [
          {
            videoId: 'vid_no_thumb',
            title: 'No Thumbnail',
            channelId: 'UC_no_thumb',
            author: 'Test',
            published: '2026-01-01T00:00:00Z',
            updated: '2026-01-01T00:00:00Z',
            link: '',
            description: 'test',
            thumbnail: null,
            viewCount: '0',
            starRating: { count: '0', average: '0', min: '1', max: '5' },
          },
        ],
      }),
    });

    const result = await fetchChannelLatest('UC_no_thumb');

    expect(result.videos[0]!.thumbnailUrl).toBeNull();
  });
});

describe('resolveChannelId', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, TRANSCRIPT_API_KEY: 'test-key' };
    jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('throws when TRANSCRIPT_API_KEY is not set', async () => {
    delete process.env.TRANSCRIPT_API_KEY;

    await expect(resolveChannelId('@TED')).rejects.toThrow('TRANSCRIPT_API_KEY is not set');
  });

  it('returns the UC channel id and url-encodes the input', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        channel_id: 'UCAuUUnT6oDeKwE6v1NGQxug',
        resolved_from: '@TED',
      }),
    });

    const channelId = await resolveChannelId('@TED');

    expect(channelId).toBe('UCAuUUnT6oDeKwE6v1NGQxug');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://transcriptapi.com/api/v2/youtube/channel/resolve?input=%40TED',
      { headers: { Authorization: 'Bearer test-key' }, cache: 'no-store' }
    );
  });

  it('accepts a full author URL and passes it through encoded', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        channel_id: 'UC_xyz',
        resolved_from: 'https://www.youtube.com/@RickAstley',
      }),
    });

    await resolveChannelId('https://www.youtube.com/@RickAstley');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://transcriptapi.com/api/v2/youtube/channel/resolve?input=https%3A%2F%2Fwww.youtube.com%2F%40RickAstley',
      { headers: { Authorization: 'Bearer test-key' }, cache: 'no-store' }
    );
  });

  it('throws on non-OK response with status and body', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'not found',
    });

    await expect(resolveChannelId('@missing')).rejects.toThrow(
      'TranscriptAPI /channel/resolve 404: not found'
    );
  });

  it('throws when response is missing channel_id', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ channel_id: '', resolved_from: '@empty' }),
    });

    await expect(resolveChannelId('@empty')).rejects.toThrow(/returned empty channel_id/);
  });
});
