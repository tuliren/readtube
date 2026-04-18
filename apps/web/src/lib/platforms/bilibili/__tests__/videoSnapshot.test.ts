import { fetchBilibiliVideoSnapshot } from '../videoSnapshot';

const mockFetch = jest.fn();
beforeEach(() => {
  mockFetch.mockReset();
  (global as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;
});

function mockJsonResponse(body: unknown, { status = 200 }: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchBilibiliVideoSnapshot', () => {
  it('maps the bilibili view API response to a VideoSnapshot', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        code: 0,
        message: '0',
        data: {
          bvid: 'BV1DgdhBGEq2',
          title: '终于来了！大疆Pocket 4上手',
          desc: '一条简单的描述',
          pic: 'http://i0.hdslb.com/bfs/archive/foo.jpg',
          pubdate: 1760000000,
          duration: 523,
          owner: { mid: 12345, name: '测试频道', face: 'http://i0.hdslb.com/bfs/face/foo.jpg' },
        },
      })
    );

    const snapshot = await fetchBilibiliVideoSnapshot('BV1DgdhBGEq2');

    expect(snapshot.videoId).toBe('BV1DgdhBGEq2');
    expect(snapshot.title).toBe('终于来了！大疆Pocket 4上手');
    expect(snapshot.description).toBe('一条简单的描述');
    expect(snapshot.thumbnailUrl).toBe('http://i0.hdslb.com/bfs/archive/foo.jpg');
    expect(snapshot.durationSeconds).toBe(523);
    expect(snapshot.publishedAt).toEqual(new Date(1760000000 * 1000));
    expect(snapshot.channel).toEqual({
      sourceId: '12345',
      name: '测试频道',
      handle: null,
      logoUrl: 'http://i0.hdslb.com/bfs/face/foo.jpg',
    });
  });

  it('nulls out pubdate and duration when the API returns 0/missing', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        code: 0,
        message: '0',
        data: {
          bvid: 'BV1DgdhBGEq2',
          title: 't',
          owner: { mid: 1, name: 'n' },
        },
      })
    );

    const snapshot = await fetchBilibiliVideoSnapshot('BV1DgdhBGEq2');
    expect(snapshot.publishedAt).toBeNull();
    expect(snapshot.durationSeconds).toBeNull();
    expect(snapshot.description).toBe('');
    expect(snapshot.thumbnailUrl).toBe('');
    expect(snapshot.channel.logoUrl).toBeNull();
  });

  it.each([
    ['non-zero code', { code: -404, message: '啥都木有' }],
    ['missing data', { code: 0, message: '0' }],
  ])('throws on %s', async (_label, body) => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(body));
    await expect(fetchBilibiliVideoSnapshot('BV1DgdhBGEq2')).rejects.toThrow(/Bilibili view API/);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    await expect(fetchBilibiliVideoSnapshot('BV1DgdhBGEq2')).rejects.toThrow(/HTTP 500/);
  });
});
