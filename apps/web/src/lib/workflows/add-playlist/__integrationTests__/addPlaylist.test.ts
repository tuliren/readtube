import '@tests/integration-tests';

import { addPlaylistForUser } from '@/lib/workflows/add-playlist';
import type { RssChannel } from '@/lib/youtube/channelRss';
import type { ScrapedPlaylist } from '@/lib/youtube/playlistScrape';

// ─── Module mocks ────────────────────────────────────────────────

jest.mock('@readtube/database', () => {
  const actual = jest.requireActual('@readtube/database');
  const prismaProxy = new Proxy({} as any, {
    get(_target, prop: string) {
      return (global as any).testPrisma[prop];
    },
  });
  return { ...actual, prisma: prismaProxy };
});

const mockFetchRssFeed = jest.fn<Promise<RssChannel>, [string]>();
jest.mock('@/lib/youtube/channelRss', () => ({
  ...jest.requireActual('@/lib/youtube/channelRss'),
  fetchRssFeed: (url: string) => mockFetchRssFeed(url),
}));

const mockScrapePlaylist = jest.fn<Promise<ScrapedPlaylist>, [string]>();
jest.mock('@/lib/youtube/playlistScrape', () => ({
  ...jest.requireActual('@/lib/youtube/playlistScrape'),
  scrapePlaylist: (id: string) => mockScrapePlaylist(id),
}));

// ─── Helpers ─────────────────────────────────────────────────────

const TEST_USER_ID = 'clerk_add_playlist_user';
const PL_ID = 'PLtest_integration';

async function resetDb() {
  await global.testPrisma.userVideoConsumption.deleteMany();
  await global.testPrisma.playlistVideo.deleteMany();
  await global.testPrisma.playlist.deleteMany();
  await global.testPrisma.standaloneVideo.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.upsert({
    where: { source_id: TEST_USER_ID },
    update: {},
    create: { source_id: TEST_USER_ID, name: 'Test', email: `${TEST_USER_ID}@example.com` },
  });
}

beforeEach(async () => {
  mockFetchRssFeed.mockReset();
  mockScrapePlaylist.mockReset();
  // Default: RSS 404s so we go through the scrape path.
  mockFetchRssFeed.mockRejectedValue(new Error('RSS fetch failed: 404 Not Found'));
  await resetDb();
});

// ─── Tests ───────────────────────────────────────────────────────

describe('addPlaylistForUser', () => {
  it('rejects when the input is not a recognized playlist URL/ID', async () => {
    await expect(addPlaylistForUser({ userId: TEST_USER_ID, input: 'not a url' })).rejects.toThrow(
      /Invalid YouTube playlist URL/
    );
  });

  it('creates a Playlist row and PlaylistVideo for each video (scrape path)', async () => {
    mockScrapePlaylist.mockResolvedValueOnce({
      title: 'My Playlist',
      channelId: 'UC_owner',
      channelName: 'Owner Name',
      videos: [
        {
          videoId: 'v1',
          title: 'First',
          description: '',
          thumbnailUrl: 'https://thumb/v1',
          durationSeconds: 100,
          channelId: 'UC_video_a',
          channelName: 'Channel A',
        },
        {
          videoId: 'v2',
          title: 'Second',
          description: '',
          thumbnailUrl: 'https://thumb/v2',
          durationSeconds: 200,
          channelId: 'UC_video_b',
          channelName: 'Channel B',
        },
      ],
    });

    const res = await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });
    expect(res.videosProcessed).toBe(2);
    expect(res.playlistName).toBe('My Playlist');

    const playlists = await global.testPrisma.playlist.findMany({
      where: { user_id: TEST_USER_ID },
    });
    expect(playlists).toHaveLength(1);
    expect(playlists[0].source_id).toBe(PL_ID);
    expect(await global.testPrisma.playlistVideo.count()).toBe(2);
  });

  it('ingests each video under its actual uploader channel, not the playlist owner', async () => {
    mockScrapePlaylist.mockResolvedValueOnce({
      title: 'Mixed',
      channelId: 'UC_owner',
      channelName: 'Owner',
      videos: [
        {
          videoId: 'v_a',
          title: 'A',
          description: '',
          thumbnailUrl: 'https://thumb/a',
          durationSeconds: 60,
          channelId: 'UC_creator_a',
          channelName: 'Creator A',
        },
        {
          videoId: 'v_b',
          title: 'B',
          description: '',
          thumbnailUrl: 'https://thumb/b',
          durationSeconds: 70,
          channelId: 'UC_creator_b',
          channelName: 'Creator B',
        },
      ],
    });

    await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });

    const videoA = await global.testPrisma.video.findUnique({
      where: { video_unique_source: { source_type: 'YOUTUBE', source_id: 'v_a' } },
      include: { channel: true },
    });
    const videoB = await global.testPrisma.video.findUnique({
      where: { video_unique_source: { source_type: 'YOUTUBE', source_id: 'v_b' } },
      include: { channel: true },
    });
    expect(videoA?.channel.source_id).toBe('UC_creator_a');
    expect(videoB?.channel.source_id).toBe('UC_creator_b');
  });

  it('sets read_at to max(published_at) + 1s so all initial videos are read', async () => {
    mockScrapePlaylist.mockResolvedValueOnce({
      title: 'P',
      channelId: 'UC_o',
      channelName: 'O',
      videos: [
        {
          videoId: 'v1',
          title: 'V1',
          description: '',
          thumbnailUrl: '',
          durationSeconds: null,
          channelId: 'UC_c',
          channelName: 'C',
        },
      ],
    });
    const before = Date.now();
    await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });

    const playlist = await global.testPrisma.playlist.findFirst({
      where: { user_id: TEST_USER_ID },
      include: { items: { include: { video: true } } },
    });
    expect(playlist?.read_at).not.toBeNull();
    // The scrape path uses new Date() as published_at; read_at is
    // set to max(published_at) + 1000ms. Confirm the delta.
    const publishedAt = playlist!.items[0].video.published_at.getTime();
    expect(playlist!.read_at!.getTime()).toBe(publishedAt + 1000);
    expect(playlist!.read_at!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('is idempotent: re-adding the same playlist returns the existing row', async () => {
    mockScrapePlaylist.mockResolvedValue({
      title: 'P',
      channelId: 'UC_o',
      channelName: 'O',
      videos: [
        {
          videoId: 'v1',
          title: 'V1',
          description: '',
          thumbnailUrl: '',
          durationSeconds: null,
          channelId: 'UC_c',
          channelName: 'C',
        },
      ],
    });
    const first = await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });
    const second = await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });

    expect(second.playlistId).toBe(first.playlistId);
    expect(second.videosProcessed).toBe(0);
    expect(await global.testPrisma.playlist.count({ where: { user_id: TEST_USER_ID } })).toBe(1);
    // Scrape should only have been called once (for the first add).
    expect(mockScrapePlaylist).toHaveBeenCalledTimes(1);
  });

  it('does NOT create StandaloneVideo rows for playlist videos', async () => {
    mockScrapePlaylist.mockResolvedValueOnce({
      title: 'P',
      channelId: 'UC_o',
      channelName: 'O',
      videos: [
        {
          videoId: 'v1',
          title: 'V1',
          description: '',
          thumbnailUrl: '',
          durationSeconds: null,
          channelId: 'UC_c',
          channelName: 'C',
        },
      ],
    });
    await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });

    expect(
      await global.testPrisma.standaloneVideo.count({ where: { user_id: TEST_USER_ID } })
    ).toBe(0);
  });

  it('uses the RSS path when the feed resolves', async () => {
    mockFetchRssFeed.mockReset();
    mockFetchRssFeed.mockResolvedValueOnce({
      channelId: 'UC_owner',
      name: 'My Playlist Via RSS',
      authorName: 'Owner Channel Name',
      videos: [
        {
          videoId: 'v_rss',
          title: 'RSS Video',
          description: 'rss desc',
          publishedAt: new Date('2026-03-01T00:00:00Z'),
          link: 'https://www.youtube.com/watch?v=v_rss',
          thumbnailUrl: null,
          channelId: 'UC_actual',
          channelName: 'Actual Uploader',
        },
      ],
    });

    const res = await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });
    expect(res.videosProcessed).toBe(1);
    expect(res.playlistName).toBe('My Playlist Via RSS');
    // Scrape fallback should NOT have been called since RSS succeeded.
    expect(mockScrapePlaylist).not.toHaveBeenCalled();
    // Per-entry channel should win.
    const video = await global.testPrisma.video.findUnique({
      where: { video_unique_source: { source_type: 'YOUTUBE', source_id: 'v_rss' } },
      include: { channel: true },
    });
    expect(video?.channel.source_id).toBe('UC_actual');
  });

  it('deduplicates playlist name when two playlists share a title', async () => {
    mockScrapePlaylist.mockResolvedValue({
      title: 'Same Name',
      channelId: 'UC_o',
      channelName: 'O',
      videos: [],
    });
    // Different source_id so the idempotent short-circuit doesn't trigger.
    await addPlaylistForUser({ userId: TEST_USER_ID, input: 'PLaaaaaaaaaaa' });
    await addPlaylistForUser({ userId: TEST_USER_ID, input: 'PLbbbbbbbbbbb' });

    const playlists = await global.testPrisma.playlist.findMany({
      where: { user_id: TEST_USER_ID },
      orderBy: { sort_order: 'asc' },
      select: { name: true },
    });
    expect(playlists.map((p: { name: string }) => p.name)).toEqual(['Same Name', 'Same Name (2)']);
  });
});
