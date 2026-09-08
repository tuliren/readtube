import { fetchBilibiliVideoSnapshot } from '../videoSnapshot';
import { fetchBilibiliVideoView } from '../videoView';
import type { BilibiliViewData } from '../viewData';

jest.mock('../videoView', () => ({
  fetchBilibiliVideoView: jest.fn(),
}));

const mockView = fetchBilibiliVideoView as jest.MockedFunction<typeof fetchBilibiliVideoView>;

const BVID = 'BV1TEST000001';

function view(overrides: Partial<BilibiliViewData> = {}): BilibiliViewData {
  return {
    bvid: BVID,
    aid: 123456,
    cid: 777,
    title: 'A video',
    desc: 'A description',
    pic: 'http://i0.hdslb.com/bfs/archive/foo.jpg',
    pubdate: 1760000000,
    duration: 523,
    owner: { mid: 12345, name: 'Uploader', face: 'http://i0.hdslb.com/bfs/face/foo.jpg' },
    pages: [{ cid: 777 }],
    ...overrides,
  };
}

beforeEach(() => {
  mockView.mockReset();
});

describe('fetchBilibiliVideoSnapshot', () => {
  it('maps the view data to a VideoSnapshot', async () => {
    mockView.mockResolvedValueOnce(view());

    const snapshot = await fetchBilibiliVideoSnapshot(BVID);

    expect(mockView).toHaveBeenCalledWith(BVID);
    expect(snapshot.videoId).toBe(BVID);
    expect(snapshot.title).toBe('A video');
    expect(snapshot.description).toBe('A description');
    expect(snapshot.thumbnailUrl).toBe('http://i0.hdslb.com/bfs/archive/foo.jpg');
    expect(snapshot.durationSeconds).toBe(523);
    expect(snapshot.publishedAt).toEqual(new Date(1760000000 * 1000));
    expect(snapshot.channel).toEqual({
      sourceId: '12345',
      name: 'Uploader',
      handle: null,
      logoUrl: 'http://i0.hdslb.com/bfs/face/foo.jpg',
    });
  });

  it('downgrades https cover and avatar URLs to http', async () => {
    mockView.mockResolvedValueOnce(
      view({
        pic: 'https://i0.hdslb.com/bfs/archive/foo.jpg',
        owner: { mid: 1, name: 'n', face: 'https://i0.hdslb.com/bfs/face/foo.jpg' },
      })
    );

    const snapshot = await fetchBilibiliVideoSnapshot(BVID);

    expect(snapshot.thumbnailUrl).toBe('http://i0.hdslb.com/bfs/archive/foo.jpg');
    expect(snapshot.channel.logoUrl).toBe('http://i0.hdslb.com/bfs/face/foo.jpg');
  });

  it.each([
    { label: 'null', pubdate: null, duration: null },
    { label: 'zero', pubdate: 0, duration: 0 },
  ])('nulls out pubdate and duration when they are $label', async ({ pubdate, duration }) => {
    mockView.mockResolvedValueOnce(
      view({ pubdate, duration, desc: null, pic: null, owner: { mid: 1, name: 'n', face: null } })
    );

    const snapshot = await fetchBilibiliVideoSnapshot(BVID);

    expect(snapshot.publishedAt).toBeNull();
    expect(snapshot.durationSeconds).toBeNull();
    expect(snapshot.description).toBe('');
    expect(snapshot.thumbnailUrl).toBe('');
    expect(snapshot.channel.logoUrl).toBeNull();
  });

  it('throws when the view data has no owner', async () => {
    mockView.mockResolvedValueOnce(view({ owner: null }));

    await expect(fetchBilibiliVideoSnapshot(BVID)).rejects.toThrow('missing owner');
  });

  it('propagates view fetch failures', async () => {
    mockView.mockRejectedValueOnce(new Error('Bilibili view API returned HTTP 500'));

    await expect(fetchBilibiliVideoSnapshot(BVID)).rejects.toThrow(/HTTP 500/);
  });
});
