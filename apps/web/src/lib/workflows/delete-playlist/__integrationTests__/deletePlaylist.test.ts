import '@tests/integration-tests';

import { deletePlaylistForUser } from '@/lib/workflows/delete-playlist';

// ─── Module mocks (hoisted by Jest) ──────────────────────────────

/**
 * Replace @readtube/database's `prisma` singleton with a lazy proxy
 * that forwards every property access to global.testPrisma at call-time.
 */
jest.mock('@readtube/database', () => {
  const actual = jest.requireActual('@readtube/database');
  const prismaProxy = new Proxy({} as any, {
    get(_target, prop: string) {
      return (global as any).testPrisma[prop];
    },
  });
  return { ...actual, prisma: prismaProxy };
});

// ─── Helpers ─────────────────────────────────────────────────────

const TEST_USER_SOURCE_ID = 'clerk_test_user_delete_playlist';

async function resetDb() {
  // Order matters — child tables first.
  await global.testPrisma.playlistVideo.deleteMany();
  await global.testPrisma.playlist.deleteMany();
  await global.testPrisma.standaloneVideo.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.upsert({
    where: { source_id: TEST_USER_SOURCE_ID },
    update: {},
    create: {
      source_id: TEST_USER_SOURCE_ID,
      name: 'Test Delete-Playlist User',
      email: `${TEST_USER_SOURCE_ID}@example.com`,
    },
  });
}

async function createChannel(sourceId: string, name: string) {
  return global.testPrisma.channel.create({
    data: {
      source_id: sourceId,
      name,
      rss_url: `https://www.youtube.com/feeds/videos.xml?channel_id=${sourceId}`,
    },
  });
}

async function createVideo(channelId: string, sourceId: string, title: string) {
  return global.testPrisma.video.create({
    data: {
      channel_id: channelId,
      source_id: sourceId,
      title,
      published_at: new Date('2026-01-01T00:00:00Z'),
    },
  });
}

async function createPlaylist(name: string, sourceId: string) {
  return global.testPrisma.playlist.create({
    data: {
      user_id: TEST_USER_SOURCE_ID,
      name,
      source_id: sourceId,
    },
  });
}

// ─── Setup / Teardown ────────────────────────────────────────────

beforeEach(async () => {
  await resetDb();
});

describe('deletePlaylistForUser', () => {
  it('deletes the playlist and cascades its PlaylistVideo rows', async () => {
    const channel = await createChannel('UC_test_1', 'Test Channel');
    const video = await createVideo(channel.id, 'vid_1', 'Video 1');
    const playlist = await createPlaylist('My List', 'PLtest1');
    await global.testPrisma.playlistVideo.create({
      data: { playlist_id: playlist.id, video_id: video.id },
    });

    const result = await deletePlaylistForUser(global.testPrisma, TEST_USER_SOURCE_ID, playlist.id);

    expect(result.deleted).toBe(true);
    expect(await global.testPrisma.playlist.findUnique({ where: { id: playlist.id } })).toBeNull();
    expect(await global.testPrisma.playlistVideo.count()).toBe(0);
  });

  it('removes StandaloneVideo rows for videos only in the deleted playlist', async () => {
    const channel = await createChannel('UC_test_2', 'Test Channel');
    const videoA = await createVideo(channel.id, 'vid_a', 'A');
    const videoB = await createVideo(channel.id, 'vid_b', 'B');
    const playlist = await createPlaylist('Only Playlist', 'PLtest2');
    await global.testPrisma.playlistVideo.createMany({
      data: [
        { playlist_id: playlist.id, video_id: videoA.id },
        { playlist_id: playlist.id, video_id: videoB.id },
      ],
    });
    // Legacy: both videos have StandaloneVideo rows (auto-created before fix).
    await global.testPrisma.standaloneVideo.createMany({
      data: [
        { user_id: TEST_USER_SOURCE_ID, video_id: videoA.id },
        { user_id: TEST_USER_SOURCE_ID, video_id: videoB.id },
      ],
    });

    const result = await deletePlaylistForUser(global.testPrisma, TEST_USER_SOURCE_ID, playlist.id);

    expect(result.deleted).toBe(true);
    expect(result.standaloneRemoved).toBe(2);
    expect(
      await global.testPrisma.standaloneVideo.count({
        where: { user_id: TEST_USER_SOURCE_ID },
      })
    ).toBe(0);
    // Underlying Video and Channel rows survive — other users may access them.
    expect(await global.testPrisma.video.count()).toBe(2);
    expect(await global.testPrisma.channel.count()).toBe(1);
  });

  it('keeps StandaloneVideo rows for videos also in another playlist', async () => {
    const channel = await createChannel('UC_test_3', 'Test Channel');
    const videoShared = await createVideo(channel.id, 'vid_shared', 'Shared');
    const videoOrphan = await createVideo(channel.id, 'vid_orphan', 'Orphan');
    const playlistA = await createPlaylist('A', 'PLtestA');
    const playlistB = await createPlaylist('B', 'PLtestB');
    await global.testPrisma.playlistVideo.createMany({
      data: [
        { playlist_id: playlistA.id, video_id: videoShared.id },
        { playlist_id: playlistA.id, video_id: videoOrphan.id },
        { playlist_id: playlistB.id, video_id: videoShared.id },
      ],
    });
    await global.testPrisma.standaloneVideo.createMany({
      data: [
        { user_id: TEST_USER_SOURCE_ID, video_id: videoShared.id },
        { user_id: TEST_USER_SOURCE_ID, video_id: videoOrphan.id },
      ],
    });

    const result = await deletePlaylistForUser(
      global.testPrisma,
      TEST_USER_SOURCE_ID,
      playlistA.id
    );

    expect(result.deleted).toBe(true);
    // Only the orphan's StandaloneVideo is removed — the shared one is
    // still in playlist B so we leave it alone.
    expect(result.standaloneRemoved).toBe(1);
    const remaining = await global.testPrisma.standaloneVideo.findMany({
      where: { user_id: TEST_USER_SOURCE_ID },
      select: { video_id: true },
    });
    expect(remaining.map((r: { video_id: string }) => r.video_id)).toEqual([videoShared.id]);
  });

  it('handles an empty playlist (no videos)', async () => {
    const playlist = await createPlaylist('Empty', 'PLempty');
    const result = await deletePlaylistForUser(global.testPrisma, TEST_USER_SOURCE_ID, playlist.id);
    expect(result.deleted).toBe(true);
    expect(result.standaloneRemoved).toBe(0);
  });

  it('returns { deleted: false } when playlist does not exist', async () => {
    const result = await deletePlaylistForUser(
      global.testPrisma,
      TEST_USER_SOURCE_ID,
      'nonexistent_id'
    );
    expect(result.deleted).toBe(false);
    expect(result.standaloneRemoved).toBe(0);
  });

  it('returns { deleted: false } when playlist belongs to another user', async () => {
    // Create a playlist owned by a different user.
    const otherUser = 'clerk_other_user_delete_playlist';
    await global.testPrisma.user.upsert({
      where: { source_id: otherUser },
      update: {},
      create: { source_id: otherUser, name: 'Other', email: `${otherUser}@example.com` },
    });
    const playlist = await global.testPrisma.playlist.create({
      data: { user_id: otherUser, name: 'Other List', source_id: 'PLother' },
    });

    const result = await deletePlaylistForUser(global.testPrisma, TEST_USER_SOURCE_ID, playlist.id);

    expect(result.deleted).toBe(false);
    // Other user's playlist still exists.
    expect(
      await global.testPrisma.playlist.findUnique({ where: { id: playlist.id } })
    ).not.toBeNull();
  });
});
