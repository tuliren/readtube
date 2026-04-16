import '@tests/integration-tests';

import { addVideoForUser } from '@/lib/workflows/add-video';
import type { VideoSnapshot } from '@/lib/youtube/videoSnapshot';

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

const mockFetchVideoSnapshot = jest.fn<Promise<VideoSnapshot>, [string]>();
jest.mock('@/lib/youtube/videoSnapshot', () => ({
  ...jest.requireActual('@/lib/youtube/videoSnapshot'),
  fetchVideoSnapshot: (id: string) => mockFetchVideoSnapshot(id),
}));

// ─── Helpers ─────────────────────────────────────────────────────

const TEST_USER_ID = 'clerk_add_video_user';

function fakeSnapshot(overrides: Partial<VideoSnapshot> = {}): VideoSnapshot {
  return {
    videoId: 'dQw4w9WgXcQ',
    title: 'Test Video',
    description: 'Hello',
    thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    publishedAt: new Date('2026-02-01T00:00:00Z'),
    durationSeconds: 300,
    channel: {
      sourceId: 'UC_test',
      name: 'Test Channel',
      handle: '@testchan',
      logoUrl: null,
    },
    ...overrides,
  };
}

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
  mockFetchVideoSnapshot.mockReset();
  await resetDb();
});

// ─── Tests ───────────────────────────────────────────────────────

describe('addVideoForUser', () => {
  it('rejects when the URL is not a recognized YouTube video', async () => {
    await expect(addVideoForUser({ userId: TEST_USER_ID, input: 'not a url' })).rejects.toThrow(
      /Invalid YouTube URL/
    );
  });

  it('creates a shadow Channel + Video + StandaloneVideo on first add', async () => {
    mockFetchVideoSnapshot.mockResolvedValueOnce(fakeSnapshot());

    const res = await addVideoForUser({ userId: TEST_USER_ID, input: 'dQw4w9WgXcQ' });
    expect(res.createdVideo).toBe(true);
    expect(res.createdChannel).toBe(true);
    expect(res.createdStandalone).toBe(true);
    expect(res.sourceId).toBe('dQw4w9WgXcQ');

    const channel = await global.testPrisma.channel.findUnique({
      where: {
        channel_unique_source: { source_type: 'YOUTUBE', source_id: 'UC_test' },
      },
    });
    expect(channel).not.toBeNull();
    expect(await global.testPrisma.video.count()).toBe(1);
    expect(
      await global.testPrisma.standaloneVideo.count({ where: { user_id: TEST_USER_ID } })
    ).toBe(1);
  });

  it('marks the newly added video as read via UserVideoConsumption', async () => {
    mockFetchVideoSnapshot.mockResolvedValueOnce(fakeSnapshot());
    await addVideoForUser({ userId: TEST_USER_ID, input: 'dQw4w9WgXcQ' });

    const consumed = await global.testPrisma.userVideoConsumption.count({
      where: { user_id: TEST_USER_ID },
    });
    expect(consumed).toBe(1);
  });

  it('is idempotent on re-add: same StandaloneVideo row, no new Video row', async () => {
    mockFetchVideoSnapshot.mockResolvedValue(fakeSnapshot());

    const first = await addVideoForUser({ userId: TEST_USER_ID, input: 'dQw4w9WgXcQ' });
    const second = await addVideoForUser({ userId: TEST_USER_ID, input: 'dQw4w9WgXcQ' });

    expect(second.standaloneVideoId).toBe(first.standaloneVideoId);
    expect(second.createdVideo).toBe(false);
    expect(second.createdChannel).toBe(false);
    expect(second.createdStandalone).toBe(false);
    expect(await global.testPrisma.video.count()).toBe(1);
    expect(await global.testPrisma.channel.count()).toBe(1);
  });

  it('reuses an existing Channel when the user is already subscribed', async () => {
    // Pre-create the channel the snapshot will reference.
    const existing = await global.testPrisma.channel.create({
      data: {
        source_type: 'YOUTUBE',
        source_id: 'UC_test',
        name: 'Subscribed Name',
        rss_url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_test',
      },
    });

    mockFetchVideoSnapshot.mockResolvedValueOnce(fakeSnapshot());
    const res = await addVideoForUser({ userId: TEST_USER_ID, input: 'dQw4w9WgXcQ' });

    expect(res.createdChannel).toBe(false);
    expect(res.channelId).toBe(existing.id);
    expect(await global.testPrisma.channel.count()).toBe(1);
  });

  it('reuses an existing Video created under a different channel (P2002 avoidance)', async () => {
    // Simulate a video created under the playlist-owner's channel,
    // then the user adds it individually with the actual channel info.
    const playlistOwner = await global.testPrisma.channel.create({
      data: {
        source_type: 'YOUTUBE',
        source_id: 'UC_playlist_owner',
        name: 'PL Owner',
        rss_url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_playlist_owner',
      },
    });
    await global.testPrisma.video.create({
      data: {
        channel_id: playlistOwner.id,
        source_type: 'YOUTUBE',
        source_id: 'dQw4w9WgXcQ',
        title: 'Stale Title',
        published_at: new Date('2026-01-01'),
      },
    });

    mockFetchVideoSnapshot.mockResolvedValueOnce(fakeSnapshot());
    const res = await addVideoForUser({ userId: TEST_USER_ID, input: 'dQw4w9WgXcQ' });

    // Same Video row — no P2002, no duplicate.
    expect(res.createdVideo).toBe(false);
    expect(await global.testPrisma.video.count()).toBe(1);
    // channel_id should have been updated to the actual channel.
    const video = await global.testPrisma.video.findUnique({
      where: {
        video_unique_source: { source_type: 'YOUTUBE', source_id: 'dQw4w9WgXcQ' },
      },
      select: { channel_id: true, title: true },
    });
    expect(video?.title).toBe('Test Video');
    const actualChannel = await global.testPrisma.channel.findUnique({
      where: {
        channel_unique_source: { source_type: 'YOUTUBE', source_id: 'UC_test' },
      },
    });
    expect(video?.channel_id).toBe(actualChannel?.id);
  });

  it('does not crash with P2002 when another channel already owns the scraped handle', async () => {
    // Another channel is holding @testchan (stale scrape or rename
    // upstream). addVideoForUser must not write the handle onto the
    // new shadow row.
    await global.testPrisma.channel.create({
      data: {
        source_type: 'YOUTUBE',
        source_id: 'UC_other',
        name: 'Other',
        rss_url: 'https://example.com/other.xml',
        handle: '@testchan',
      },
    });

    mockFetchVideoSnapshot.mockResolvedValueOnce(fakeSnapshot());
    const res = await addVideoForUser({ userId: TEST_USER_ID, input: 'dQw4w9WgXcQ' });

    // No throw; shadow channel created with handle = null.
    expect(res.createdChannel).toBe(true);
    const shadow = await global.testPrisma.channel.findUnique({
      where: {
        channel_unique_source: { source_type: 'YOUTUBE', source_id: 'UC_test' },
      },
    });
    expect(shadow?.handle).toBeNull();
    // Pre-existing channel's handle is untouched.
    const other = await global.testPrisma.channel.findUnique({
      where: {
        channel_unique_source: { source_type: 'YOUTUBE', source_id: 'UC_other' },
      },
    });
    expect(other?.handle).toBe('@testchan');
  });
});
