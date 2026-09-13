import '@tests/integration-tests';

import type { RssChannel } from '@/lib/platforms/youtube/channelRss';
import type { ScrapedPlaylist } from '@/lib/platforms/youtube/playlistScrape';
import { addPlaylistForUser } from '@/lib/workflows/add-playlist';
import {
  PlaylistRefreshLimitedError,
  refreshPlaylistForUser,
} from '@/lib/workflows/refresh-playlist';

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
jest.mock('@/lib/platforms/youtube/channelRss', () => ({
  ...jest.requireActual('@/lib/platforms/youtube/channelRss'),
  fetchRssFeed: (url: string) => mockFetchRssFeed(url),
}));

const mockScrapePlaylist = jest.fn<Promise<ScrapedPlaylist>, [string]>();
jest.mock('@/lib/platforms/youtube/playlistScrape', () => ({
  ...jest.requireActual('@/lib/platforms/youtube/playlistScrape'),
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
  delete process.env.NEXT_PUBLIC_VERCEL_ENV;
  mockFetchRssFeed.mockReset();
  mockScrapePlaylist.mockReset();
  // These tests exercise the RSS/scrape fallback chain — keep the
  // Data API tier off even if the environment has a key set.
  delete process.env.YOUTUBE_API_KEY;
  // Default: RSS 404s so we go through the scrape path.
  mockFetchRssFeed.mockRejectedValue(new Error('RSS fetch failed: 404 Not Found'));
  await resetDb();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_VERCEL_ENV;
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

  it('sets read_at to ~now when the scrape path produces no publish dates', async () => {
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
    const after = Date.now();

    const playlist = await global.testPrisma.playlist.findFirst({
      where: { user_id: TEST_USER_ID },
      include: { items: { include: { video: true } } },
    });
    // Scrape-only videos persist with published_at = null. The
    // watermark falls back to now() so existing videos are treated as
    // read — otherwise the user would see their entire just-added
    // playlist as unread. `videoNewerThanWatermark` compares against
    // `created_at` when `published_at` is null, so later additions
    // still surface as unread.
    expect(playlist?.read_at).not.toBeNull();
    expect(playlist!.read_at!.getTime()).toBeGreaterThanOrEqual(before);
    expect(playlist!.read_at!.getTime()).toBeLessThanOrEqual(after + 1000);
    expect(playlist!.items[0].video.published_at).toBeNull();
  });

  it('marks every video in a newly added playlist as read (unread count = 0)', async () => {
    // Mix of RSS-dated and scrape-only videos to exercise both
    // branches of videoNewerThanWatermark. All of them should be
    // considered read the moment the playlist is added.
    mockFetchRssFeed.mockResolvedValueOnce({
      channelId: 'UC_owner',
      name: 'Owner',
      authorName: 'Owner',
      videos: [
        {
          videoId: 'dated_v1',
          title: 'Dated V1',
          description: '',
          publishedAt: new Date('2026-03-01T00:00:00Z'),
          link: 'https://www.youtube.com/watch?v=dated_v1',
          thumbnailUrl: null,
          channelId: 'UC_owner',
          channelName: 'Owner',
        },
        {
          videoId: 'dated_v2',
          title: 'Dated V2',
          description: '',
          publishedAt: new Date('2026-02-01T00:00:00Z'),
          link: 'https://www.youtube.com/watch?v=dated_v2',
          thumbnailUrl: null,
          channelId: 'UC_owner',
          channelName: 'Owner',
        },
      ],
    });

    await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });

    const playlist = await global.testPrisma.playlist.findFirst({
      where: { user_id: TEST_USER_ID },
    });
    expect(playlist).not.toBeNull();
    expect(playlist!.read_at).not.toBeNull();

    // Unread-count query shape mirrors
    // apps/web/src/app/api/playlists/route.ts — a video is unread iff
    // no UserVideoConsumption row exists for this user AND its
    // effective publish date is past the watermark.
    const unreadCount = await global.testPrisma.playlistVideo.count({
      where: {
        playlist_id: playlist!.id,
        video: {
          consumptions: { none: { user_id: TEST_USER_ID } },
          OR: [
            { published_at: { gt: playlist!.read_at! } },
            { AND: [{ published_at: null }, { created_at: { gt: playlist!.read_at! } }] },
          ],
        },
      },
    });
    expect(unreadCount).toBe(0);
  });

  it('sets read_at to max(published_at) + 1s when RSS supplies real dates', async () => {
    mockFetchRssFeed.mockResolvedValueOnce({
      channelId: 'UC_o',
      name: 'O',
      authorName: 'O',
      videos: [
        {
          videoId: 'rss_v1',
          title: 'V1',
          description: '',
          publishedAt: new Date('2026-03-01T00:00:00Z'),
          link: 'https://www.youtube.com/watch?v=rss_v1',
          thumbnailUrl: null,
          channelId: 'UC_o',
          channelName: 'O',
        },
      ],
    });

    await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });

    const playlist = await global.testPrisma.playlist.findFirst({
      where: { user_id: TEST_USER_ID },
      include: { items: { include: { video: true } } },
    });
    expect(playlist?.read_at).not.toBeNull();
    const publishedAt = playlist!.items[0].video.published_at!.getTime();
    expect(playlist!.read_at!.getTime()).toBe(publishedAt + 1000);
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

describe('refreshPlaylistForUser', () => {
  function refreshedFeed(): ScrapedPlaylist {
    return {
      title: 'Source playlist',
      channelId: 'test-owner',
      channelName: 'Owner',
      videos: [
        {
          videoId: 'existing-entry',
          title: 'Updated title',
          description: 'Updated description',
          thumbnailUrl: 'https://example.com/thumbnail.jpg',
          durationSeconds: 120,
          channelId: 'test-uploader',
          channelName: 'Uploader',
        },
        {
          videoId: 'new-entry',
          title: 'New entry',
          description: '',
          thumbnailUrl: 'https://example.com/thumbnail.jpg',
          durationSeconds: 90,
          channelId: 'test-uploader',
          channelName: 'Uploader',
        },
      ],
    };
  }

  it('refreshes in place, appends new entries, and preserves user state across repeated refreshes', async () => {
    const initialFeed = refreshedFeed();
    initialFeed.videos = [initialFeed.videos[0]];
    initialFeed.videos[0].title = 'Original title';
    mockScrapePlaylist.mockResolvedValueOnce(initialFeed);
    const added = await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });
    const watermark = new Date('2020-01-01');
    await global.testPrisma.playlist.update({
      where: { id: added.playlistId },
      data: { custom_name: 'My custom name', read_at: watermark, sort_order: 7 },
    });
    const existing = await global.testPrisma.playlistVideo.findFirstOrThrow({
      where: { playlist_id: added.playlistId },
    });
    await global.testPrisma.playlistVideo.update({
      where: { id: existing.id },
      data: { sort_order: 4 },
    });
    await global.testPrisma.userVideoConsumption.create({
      data: { user_id: TEST_USER_ID, video_id: existing.video_id },
    });
    // An entry missing from a partial source response must remain in the library.
    const retainedVideo = await global.testPrisma.video.create({
      data: {
        source_id: 'retained-entry',
        title: 'Retained entry',
        channel_id: (
          await global.testPrisma.video.findUniqueOrThrow({
            where: { id: existing.video_id },
          })
        ).channel_id,
      },
    });
    await global.testPrisma.playlistVideo.create({
      data: { playlist_id: added.playlistId, video_id: retainedVideo.id, sort_order: 5 },
    });
    mockScrapePlaylist.mockResolvedValue(refreshedFeed());
    for (let i = 0; i < 2; i++) {
      expect(
        await refreshPlaylistForUser(global.testPrisma, TEST_USER_ID, added.playlistId)
      ).toEqual({
        videosProcessed: 2,
      });
    }

    const playlist = await global.testPrisma.playlist.findUniqueOrThrow({
      where: { id: added.playlistId },
      include: { items: { include: { video: true }, orderBy: { sort_order: 'asc' } } },
    });
    expect(await global.testPrisma.playlist.count()).toBe(1);
    expect(playlist).toMatchObject({
      custom_name: 'My custom name',
      read_at: watermark,
      sort_order: 7,
    });
    expect(playlist.items.map((item) => item.video.source_id)).toEqual([
      'existing-entry',
      'retained-entry',
      'new-entry',
    ]);
    expect(playlist.items[0].sort_order).toBe(4);
    expect(playlist.items[0].video.title).toBe('Updated title');
    expect(playlist.items[2].sort_order).toBeGreaterThan(5);
    expect(playlist.items[2].video.created_at.getTime()).toBeGreaterThan(watermark.getTime());
    expect(await global.testPrisma.userVideoConsumption.count()).toBe(1);
  });

  it.each(['missing-playlist', 'other-user'])(
    'does not fetch or mutate an inaccessible playlist: %s',
    async (scenario) => {
      mockScrapePlaylist.mockResolvedValue(refreshedFeed());
      const added = await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });
      mockScrapePlaylist.mockClear();
      mockFetchRssFeed.mockClear();
      const result = await refreshPlaylistForUser(
        global.testPrisma,
        scenario === 'other-user' ? 'someone-else' : TEST_USER_ID,
        scenario === 'missing-playlist' ? 'missing' : added.playlistId
      );
      expect(result).toBeNull();
      expect(mockScrapePlaylist).not.toHaveBeenCalled();
      expect(mockFetchRssFeed).not.toHaveBeenCalled();
    }
  );

  it('leaves the playlist untouched when all fetch sources fail', async () => {
    mockScrapePlaylist.mockResolvedValueOnce(refreshedFeed());
    const added = await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });
    const before = await global.testPrisma.playlist.findUniqueOrThrow({
      where: { id: added.playlistId },
      include: { items: true },
    });
    mockScrapePlaylist.mockRejectedValueOnce(new Error('Upstream unavailable'));
    await expect(
      refreshPlaylistForUser(global.testPrisma, TEST_USER_ID, added.playlistId)
    ).rejects.toThrow('Upstream unavailable');
    expect(
      await global.testPrisma.playlist.findUniqueOrThrow({
        where: { id: added.playlistId },
        include: { items: true },
      })
    ).toEqual({ ...before, updated_at: expect.any(Date) });
  });

  it.each([
    { ageHours: null, allowed: true },
    { ageHours: 23, allowed: false },
    { ageHours: 25, allowed: true },
  ])(
    'enforces the production cooldown with a timestamp $ageHours hours old',
    async ({ ageHours, allowed }) => {
      mockScrapePlaylist.mockResolvedValue(refreshedFeed());
      const added = await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });
      const timestamp = ageHours == null ? null : new Date(Date.now() - ageHours * 60 * 60 * 1000);
      await global.testPrisma.playlist.update({
        where: { id: added.playlistId },
        data: { checked_at: timestamp },
      });
      mockFetchRssFeed.mockClear();
      mockScrapePlaylist.mockClear();
      process.env.NEXT_PUBLIC_VERCEL_ENV = 'production';
      const refresh = refreshPlaylistForUser(global.testPrisma, TEST_USER_ID, added.playlistId);
      if (allowed) {
        await expect(refresh).resolves.toEqual({ videosProcessed: 2 });
        const playlist = await global.testPrisma.playlist.findUniqueOrThrow({
          where: { id: added.playlistId },
        });
        expect(playlist.checked_at!.getTime()).toBeGreaterThan(Date.now() - 10_000);
        expect(playlist.refresh_started_at).toBeNull();
        await expect(
          refreshPlaylistForUser(global.testPrisma, TEST_USER_ID, added.playlistId)
        ).rejects.toBeInstanceOf(PlaylistRefreshLimitedError);
        expect(mockScrapePlaylist).toHaveBeenCalledTimes(1);
      } else {
        await expect(refresh).rejects.toBeInstanceOf(PlaylistRefreshLimitedError);
        expect(mockScrapePlaylist).not.toHaveBeenCalled();
        expect(mockFetchRssFeed).not.toHaveBeenCalled();
      }
    }
  );

  it('blocks concurrent fetches and recovers abandoned claims', async () => {
    mockScrapePlaylist.mockResolvedValueOnce(refreshedFeed());
    const added = await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });
    await global.testPrisma.playlist.update({
      where: { id: added.playlistId },
      data: {
        checked_at: null,
        refresh_started_at: new Date(Date.now() - 11 * 60 * 1000),
      },
    });
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'production';
    mockScrapePlaylist.mockClear();
    mockScrapePlaylist.mockImplementationOnce(async () => {
      await expect(
        refreshPlaylistForUser(global.testPrisma, TEST_USER_ID, added.playlistId)
      ).rejects.toBeInstanceOf(PlaylistRefreshLimitedError);
      return refreshedFeed();
    });
    await expect(
      refreshPlaylistForUser(global.testPrisma, TEST_USER_ID, added.playlistId)
    ).resolves.toEqual({ videosProcessed: 2 });
    expect(mockScrapePlaylist).toHaveBeenCalledTimes(1);
  });

  it('starts the cooldown after a successful import and leaves it unchanged by read-state updates', async () => {
    mockScrapePlaylist.mockResolvedValueOnce(refreshedFeed());
    const added = await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });
    const playlist = await global.testPrisma.playlist.findUniqueOrThrow({
      where: { id: added.playlistId },
    });
    expect(playlist.checked_at).not.toBeNull();
    await global.testPrisma.playlist.update({
      where: { id: added.playlistId },
      data: { read_at: new Date() },
    });
    expect(
      (await global.testPrisma.playlist.findUniqueOrThrow({ where: { id: added.playlistId } }))
        .checked_at
    ).toEqual(playlist.checked_at);
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'production';
    await expect(
      refreshPlaylistForUser(global.testPrisma, TEST_USER_ID, added.playlistId)
    ).rejects.toBeInstanceOf(PlaylistRefreshLimitedError);
  });

  it('does not recreate a playlist deleted during the fetch', async () => {
    mockScrapePlaylist.mockResolvedValueOnce(refreshedFeed());
    const added = await addPlaylistForUser({ userId: TEST_USER_ID, input: PL_ID });
    mockScrapePlaylist.mockImplementationOnce(async () => {
      await global.testPrisma.playlist.delete({ where: { id: added.playlistId } });
      return refreshedFeed();
    });
    expect(
      await refreshPlaylistForUser(global.testPrisma, TEST_USER_ID, added.playlistId)
    ).toBeNull();
    expect(await global.testPrisma.playlist.count()).toBe(0);
  });
});
