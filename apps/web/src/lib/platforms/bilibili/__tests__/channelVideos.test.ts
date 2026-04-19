import { fetchBilibiliChannelVideos, normalizeThumbnailUrl, parseDuration } from '../channelVideos';
import * as wbi from '../wbi';

describe('parseDuration', () => {
  it.each([
    ['M:SS', '5:23', 323],
    ['H:MM:SS', '1:02:30', 3750],
    ['zero-padded M:SS', '00:45', 45],
    ['long video', '2:00:00', 7200],
  ])('parses %s', (_label, input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each([
    ['empty string', ''],
    ['not a number', 'abc'],
    ['wrong separator', '5m23s'],
    ['single number', '30'],
    ['four parts', '1:2:3:4'],
    ['negative', '-1:00'],
    ['null', null],
    ['undefined', undefined],
  ])('returns null for %s', (_label, input) => {
    expect(parseDuration(input as unknown)).toBeNull();
  });
});

describe('normalizeThumbnailUrl', () => {
  it.each([
    [
      'protocol-relative',
      '//i0.hdslb.com/bfs/archive/abc.jpg',
      'https://i0.hdslb.com/bfs/archive/abc.jpg',
    ],
    [
      'http upgrade',
      'http://i0.hdslb.com/bfs/archive/abc.jpg',
      'https://i0.hdslb.com/bfs/archive/abc.jpg',
    ],
    [
      'https passthrough',
      'https://i0.hdslb.com/bfs/archive/abc.jpg',
      'https://i0.hdslb.com/bfs/archive/abc.jpg',
    ],
  ])('normalizes %s', (_label, input, expected) => {
    expect(normalizeThumbnailUrl(input)).toBe(expected);
  });

  it.each([
    ['empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('returns empty string for %s', (_label, input) => {
    expect(normalizeThumbnailUrl(input)).toBe('');
  });
});

describe('fetchBilibiliChannelVideos', () => {
  beforeEach(() => {
    jest.spyOn(wbi, 'signWbi').mockImplementation(async (params) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        out[k] = String(v);
      }
      out.wts = '1700000000';
      out.w_rid = 'mocked_signature';
      return out;
    });
    jest.spyOn(wbi, 'getBilibiliAntiBotCookie').mockResolvedValue('buvid3=mock3; buvid4=mock4');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps arc/search items to BilibiliChannelVideo', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 0,
          message: '0',
          data: {
            list: {
              vlist: [
                {
                  bvid: 'BV1DgdhBGEq2',
                  title: '终于来了！大疆Pocket 4上手',
                  description: 'Pocket 4 review',
                  pic: '//i0.hdslb.com/bfs/archive/thumbnail.jpg',
                  created: 1_700_000_000,
                  length: '20:38',
                },
                {
                  bvid: 'BV1NGZtBwELa',
                  title: '4K limited sample',
                  description: '',
                  pic: 'https://i1.hdslb.com/bfs/archive/other.jpg',
                  created: 1_699_900_000,
                  length: '3:39',
                },
              ],
            },
            page: { count: 56, pn: 1, ps: 30 },
          },
        })
      )
    );

    const result = await fetchBilibiliChannelVideos('946974');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      videoId: 'BV1DgdhBGEq2',
      title: '终于来了！大疆Pocket 4上手',
      description: 'Pocket 4 review',
      thumbnailUrl: 'https://i0.hdslb.com/bfs/archive/thumbnail.jpg',
      publishedAt: new Date(1_700_000_000 * 1000),
      durationSeconds: 1238,
    });
    expect(result[1].durationSeconds).toBe(219);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = (fetchMock.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain('api.bilibili.com/x/space/wbi/arc/search');
    expect(calledUrl).toContain('mid=946974');
    expect(calledUrl).toContain('w_rid=mocked_signature');
    expect(calledUrl).toContain('order=pubdate');
  });

  it('throws on non-zero API code', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: -352,
          message: 'risk control',
          data: null,
        })
      )
    );

    await expect(fetchBilibiliChannelVideos('946974')).rejects.toThrow(/code=-352/);
  });

  it('throws on non-ok HTTP status', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('error', { status: 500 }));
    await expect(fetchBilibiliChannelVideos('946974')).rejects.toThrow(/HTTP 500/);
  });

  it('returns empty array when vlist is missing', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 0,
          message: '0',
          data: { list: {}, page: { count: 0, pn: 1, ps: 30 } },
        })
      )
    );
    const result = await fetchBilibiliChannelVideos('946974');
    expect(result).toEqual([]);
  });

  it('filters items missing bvid or title', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 0,
          message: '0',
          data: {
            list: {
              vlist: [
                { bvid: 'BV1DgdhBGEq2', title: 'ok' },
                { bvid: 'BV1other', title: null },
                { title: 'no bvid' },
              ],
            },
          },
        })
      )
    );
    const result = await fetchBilibiliChannelVideos('946974');
    expect(result).toHaveLength(1);
    expect(result[0].videoId).toBe('BV1DgdhBGEq2');
  });
});
