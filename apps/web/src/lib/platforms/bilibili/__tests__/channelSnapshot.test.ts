import type { ChannelSnapshotHints } from '@/lib/platforms/base';

import { fetchBilibiliChannelSnapshot } from '../channelSnapshot';
import { type JustOneApiChannelResult, fetchBilibiliChannelViaJustOneApi } from '../justOneApi';
import { fetchBilibiliVideoSnapshot } from '../videoSnapshot';

jest.mock('../justOneApi', () => ({
  ...jest.requireActual('../justOneApi'),
  fetchBilibiliChannelViaJustOneApi: jest.fn(),
}));

jest.mock('../videoSnapshot', () => ({
  fetchBilibiliVideoSnapshot: jest.fn(),
}));

const mockList = fetchBilibiliChannelViaJustOneApi as jest.MockedFunction<
  typeof fetchBilibiliChannelViaJustOneApi
>;
const mockView = fetchBilibiliVideoSnapshot as jest.MockedFunction<
  typeof fetchBilibiliVideoSnapshot
>;

const MID = '946974';
const FIRST_BVID = 'BV1TEST000001';
const KNOWN_LOGO = 'http://i0.hdslb.com/bfs/face/known.jpg';
const VIEW_LOGO = 'http://i0.hdslb.com/bfs/face/view.jpg';

function listResult(name: string | null): JustOneApiChannelResult {
  return {
    channel: { mid: MID, name, logoUrl: null },
    videos: [
      {
        videoId: FIRST_BVID,
        title: 'First video',
        description: '',
        thumbnailUrl: 'http://i0.hdslb.com/bfs/archive/first.jpg',
        publishedAt: new Date('2026-04-16T12:00:00Z'),
        durationSeconds: 100,
      },
    ],
    raw: {},
  };
}

function viewResult() {
  return {
    videoId: FIRST_BVID,
    title: 'First video',
    description: '',
    thumbnailUrl: 'http://i0.hdslb.com/bfs/archive/first.jpg',
    publishedAt: new Date('2026-04-16T12:00:00Z'),
    durationSeconds: 100,
    channel: { sourceId: MID, name: 'View Name', handle: null, logoUrl: VIEW_LOGO },
  };
}

beforeEach(() => {
  mockList.mockReset();
  mockView.mockReset();
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchBilibiliChannelSnapshot', () => {
  it('skips the view fallback when the name and avatar are already known', async () => {
    mockList.mockResolvedValueOnce(listResult('Author'));

    const snapshot = await fetchBilibiliChannelSnapshot(MID, {
      knownName: 'Old Name',
      knownLogoUrl: KNOWN_LOGO,
    });

    expect(mockView).not.toHaveBeenCalled();
    // The list response is the freshest name source, so it wins.
    expect(snapshot.name).toBe('Author');
    expect(snapshot.logoUrl).toBe(KNOWN_LOGO);
    expect(snapshot.videos.map((v) => v.videoId)).toEqual([FIRST_BVID]);
  });

  it.each<{ label: string; hints: ChannelSnapshotHints }>([
    { label: 'no hints', hints: {} },
    { label: 'a name hint but no avatar', hints: { knownName: 'Old Name', knownLogoUrl: null } },
    { label: 'an empty-string avatar hint', hints: { knownLogoUrl: '' } },
  ])('backfills the avatar from the view API given $label', async ({ hints }) => {
    mockList.mockResolvedValueOnce(listResult('Author'));
    mockView.mockResolvedValueOnce(viewResult());

    const snapshot = await fetchBilibiliChannelSnapshot(MID, hints);

    expect(mockView).toHaveBeenCalledWith(FIRST_BVID);
    expect(snapshot.name).toBe('Author');
    expect(snapshot.logoUrl).toBe(VIEW_LOGO);
  });

  it.each<{ label: string; listName: string | null; hints: ChannelSnapshotHints; name: string }>([
    { label: 'name from the list, no avatar', listName: 'Author', hints: {}, name: 'Author' },
    {
      label: 'no list name, a known name',
      listName: null,
      hints: { knownName: 'Known' },
      name: 'Known',
    },
    { label: 'no name anywhere', listName: null, hints: {}, name: 'Unknown' },
  ])(
    'still returns the snapshot when the view fallback fails ($label)',
    async ({ listName, hints, name }) => {
      mockList.mockResolvedValueOnce(listResult(listName));
      mockView.mockRejectedValueOnce(new Error('Bilibili view API returned HTTP 412'));

      const snapshot = await fetchBilibiliChannelSnapshot(MID, hints);

      expect(snapshot.name).toBe(name);
      expect(snapshot.logoUrl).toBeNull();
      expect(snapshot.videos).toHaveLength(1);
      expect(console.warn).toHaveBeenCalledTimes(1);
    }
  );

  it('rejects when JustOneAPI returns no videos', async () => {
    mockList.mockResolvedValueOnce({ ...listResult('Author'), videos: [] });

    await expect(fetchBilibiliChannelSnapshot(MID)).rejects.toThrow('returned no videos');
    expect(mockView).not.toHaveBeenCalled();
  });
});
