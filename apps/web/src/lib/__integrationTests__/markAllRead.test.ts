import '@tests/integration-tests';

import { markLibraryRead, markPlaylistRead, markStandaloneRead } from '@/lib/markAllRead';

// Every mark-all-read branch has to survive round-trips through the
// unread-count query shapes used in production (see
// `lib/subscriptions.ts` and `api/playlists/route.ts`), so each test
// below asserts DB state AND re-runs an unread count to prove the
// UX effect.

const USER_A = 'clerk_mark_read_user_a';
const USER_B = 'clerk_mark_read_user_b';

async function resetDb() {
  await global.testPrisma.userVideoConsumption.deleteMany();
  await global.testPrisma.playlistVideo.deleteMany();
  await global.testPrisma.playlist.deleteMany();
  await global.testPrisma.standaloneVideo.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
  await global.testPrisma.user.createMany({
    data: [
      { source_id: USER_A, name: 'A', email: `${USER_A}@example.com` },
      { source_id: USER_B, name: 'B', email: `${USER_B}@example.com` },
    ],
  });
}

async function createVideo(opts: {
  channelSourceId: string;
  videoSourceId: string;
  publishedAt?: Date | null;
}) {
  const existing = await global.testPrisma.channel.findFirst({
    where: { source_id: opts.channelSourceId },
    select: { id: true },
  });
  const channel =
    existing ??
    (await global.testPrisma.channel.create({
      data: {
        source_id: opts.channelSourceId,
        name: `Channel ${opts.channelSourceId}`,
        rss_url: `https://example.com/${opts.channelSourceId}.xml`,
      },
      select: { id: true },
    }));
  return global.testPrisma.video.create({
    data: {
      channel_id: channel.id,
      source_id: opts.videoSourceId,
      title: `Video ${opts.videoSourceId}`,
      published_at: opts.publishedAt ?? null,
    },
  });
}

async function countUnreadForPlaylist(userId: string, playlistId: string): Promise<number> {
  const pl = await global.testPrisma.playlist.findUniqueOrThrow({
    where: { id: playlistId },
    select: { read_at: true },
  });
  return global.testPrisma.playlistVideo.count({
    where: {
      playlist_id: playlistId,
      video: {
        consumptions: { none: { user_id: userId } },
        ...(pl.read_at != null
          ? {
              OR: [
                { published_at: { gt: pl.read_at } },
                { AND: [{ published_at: null }, { created_at: { gt: pl.read_at } }] },
              ],
            }
          : {}),
      },
    },
  });
}

async function countUnreadStandalone(userId: string): Promise<number> {
  // Standalone videos have no watermark — a video is unread iff there
  // is no UserVideoConsumption row for this user.
  return global.testPrisma.standaloneVideo.count({
    where: {
      user_id: userId,
      video: { consumptions: { none: { user_id: userId } } },
    },
  });
}

beforeEach(async () => {
  await resetDb();
});

describe('markPlaylistRead', () => {
  it('bumps read_at to ~now and drives the playlist unread count to zero', async () => {
    const v1 = await createVideo({
      channelSourceId: 'mp_ch1',
      videoSourceId: 'mp_v1',
      publishedAt: new Date('2026-03-01T00:00:00Z'),
    });
    const v2 = await createVideo({
      channelSourceId: 'mp_ch1',
      videoSourceId: 'mp_v2',
      publishedAt: null, // scrape-only
    });
    const playlist = await global.testPrisma.playlist.create({
      data: {
        user_id: USER_A,
        source_id: 'PL_mark_read',
        name: 'PL',
        read_at: null, // simulate a stale "everything unread" state
        items: {
          create: [
            { video_id: v1.id, sort_order: 0 },
            { video_id: v2.id, sort_order: 1 },
          ],
        },
      },
    });

    expect(await countUnreadForPlaylist(USER_A, playlist.id)).toBe(2);

    const before = Date.now();
    const result = await markPlaylistRead(global.testPrisma, USER_A, playlist.id);
    const after = Date.now();

    expect(result).toEqual({ ok: true });

    const updated = await global.testPrisma.playlist.findUniqueOrThrow({
      where: { id: playlist.id },
      select: { read_at: true },
    });
    expect(updated.read_at).not.toBeNull();
    expect(updated.read_at!.getTime()).toBeGreaterThanOrEqual(before);
    expect(updated.read_at!.getTime()).toBeLessThanOrEqual(after + 1000);

    expect(await countUnreadForPlaylist(USER_A, playlist.id)).toBe(0);
  });

  it('leaves videos added after the mark as unread', async () => {
    const v1 = await createVideo({
      channelSourceId: 'mp_ch2',
      videoSourceId: 'mp_old',
      publishedAt: new Date('2026-03-01T00:00:00Z'),
    });
    const playlist = await global.testPrisma.playlist.create({
      data: {
        user_id: USER_A,
        source_id: 'PL_later',
        name: 'PL Later',
        items: { create: [{ video_id: v1.id, sort_order: 0 }] },
      },
    });

    await markPlaylistRead(global.testPrisma, USER_A, playlist.id);
    expect(await countUnreadForPlaylist(USER_A, playlist.id)).toBe(0);

    // A new video drops in after the watermark. Use a null
    // published_at so the comparison falls back to created_at, which
    // is by construction later than the read_at we just set.
    // (Pinning a real date that's reliably past wall-clock now is
    // awkward, and scrape-path additions are exactly this shape.)
    const v2 = await createVideo({
      channelSourceId: 'mp_ch2',
      videoSourceId: 'mp_new',
      publishedAt: null,
    });
    await global.testPrisma.playlistVideo.create({
      data: { playlist_id: playlist.id, video_id: v2.id, sort_order: 1 },
    });

    expect(await countUnreadForPlaylist(USER_A, playlist.id)).toBe(1);
  });

  it('returns null (→ 404 at route layer) for another user’s playlist', async () => {
    const v1 = await createVideo({ channelSourceId: 'mp_ch3', videoSourceId: 'mp_u_v' });
    const theirs = await global.testPrisma.playlist.create({
      data: {
        user_id: USER_B,
        source_id: 'PL_theirs',
        name: 'Theirs',
        items: { create: [{ video_id: v1.id, sort_order: 0 }] },
      },
    });

    const result = await markPlaylistRead(global.testPrisma, USER_A, theirs.id);
    expect(result).toBeNull();

    const row = await global.testPrisma.playlist.findUniqueOrThrow({
      where: { id: theirs.id },
      select: { read_at: true },
    });
    expect(row.read_at).toBeNull();
  });

  it('returns null for a non-existent playlist', async () => {
    const result = await markPlaylistRead(global.testPrisma, USER_A, 'does-not-exist');
    expect(result).toBeNull();
  });
});

describe('markStandaloneRead', () => {
  it('creates a UserVideoConsumption row for every standalone video not already in a playlist', async () => {
    const v1 = await createVideo({ channelSourceId: 'ms_ch', videoSourceId: 'ms_v1' });
    const v2 = await createVideo({ channelSourceId: 'ms_ch', videoSourceId: 'ms_v2' });
    // v3 is BOTH in standalone and in a playlist; standaloneOnly should skip it.
    const v3 = await createVideo({ channelSourceId: 'ms_ch', videoSourceId: 'ms_v3' });

    await global.testPrisma.standaloneVideo.createMany({
      data: [
        { user_id: USER_A, video_id: v1.id },
        { user_id: USER_A, video_id: v2.id },
        { user_id: USER_A, video_id: v3.id },
      ],
    });
    await global.testPrisma.playlist.create({
      data: {
        user_id: USER_A,
        source_id: 'PL_overlap',
        name: 'Overlap',
        items: { create: [{ video_id: v3.id, sort_order: 0 }] },
      },
    });

    expect(await countUnreadStandalone(USER_A)).toBe(3);

    const result = await markStandaloneRead(global.testPrisma, USER_A);
    expect(result).toEqual({ count: 2 });

    // v1 + v2 got consumption rows; v3 did not because it's also in a playlist.
    const consumptions = await global.testPrisma.userVideoConsumption.findMany({
      where: { user_id: USER_A },
      select: { video_id: true },
      orderBy: { video_id: 'asc' },
    });
    expect(consumptions.map((c) => c.video_id).sort()).toEqual([v1.id, v2.id].sort());
    expect(consumptions.map((c) => c.video_id)).not.toContain(v3.id);
  });

  it('does not touch another user’s standalone videos', async () => {
    const v = await createVideo({ channelSourceId: 'ms_cross', videoSourceId: 'ms_cross_v' });
    await global.testPrisma.standaloneVideo.createMany({
      data: [
        { user_id: USER_A, video_id: v.id },
        { user_id: USER_B, video_id: v.id },
      ],
    });

    await markStandaloneRead(global.testPrisma, USER_A);

    const aConsumed = await global.testPrisma.userVideoConsumption.findMany({
      where: { user_id: USER_A },
    });
    const bConsumed = await global.testPrisma.userVideoConsumption.findMany({
      where: { user_id: USER_B },
    });
    expect(aConsumed).toHaveLength(1);
    expect(bConsumed).toHaveLength(0);
  });

  it('is idempotent — calling twice does not create duplicate consumption rows', async () => {
    const v = await createVideo({ channelSourceId: 'ms_idem', videoSourceId: 'ms_idem_v' });
    await global.testPrisma.standaloneVideo.create({
      data: { user_id: USER_A, video_id: v.id },
    });

    await markStandaloneRead(global.testPrisma, USER_A);
    await markStandaloneRead(global.testPrisma, USER_A);

    const rows = await global.testPrisma.userVideoConsumption.findMany({
      where: { user_id: USER_A, video_id: v.id },
    });
    expect(rows).toHaveLength(1);
  });

  it('handles a user with no standalone videos without error', async () => {
    const result = await markStandaloneRead(global.testPrisma, USER_A);
    expect(result).toEqual({ count: 0 });
  });
});

describe('markLibraryRead', () => {
  it('bumps every playlist watermark and creates consumption rows for every standalone video', async () => {
    const v1 = await createVideo({ channelSourceId: 'ml_ch', videoSourceId: 'ml_v1' });
    const v2 = await createVideo({ channelSourceId: 'ml_ch', videoSourceId: 'ml_v2' });
    const v3 = await createVideo({ channelSourceId: 'ml_ch', videoSourceId: 'ml_v3' });

    await global.testPrisma.standaloneVideo.createMany({
      data: [
        { user_id: USER_A, video_id: v1.id },
        { user_id: USER_A, video_id: v2.id },
      ],
    });
    const plA = await global.testPrisma.playlist.create({
      data: {
        user_id: USER_A,
        source_id: 'PL_ml_a',
        name: 'A',
        read_at: null,
        items: { create: [{ video_id: v3.id, sort_order: 0 }] },
      },
    });
    const plB = await global.testPrisma.playlist.create({
      data: {
        user_id: USER_A,
        source_id: 'PL_ml_b',
        name: 'B',
        read_at: null,
        items: { create: [{ video_id: v1.id, sort_order: 0 }] },
      },
    });

    expect(await countUnreadStandalone(USER_A)).toBe(2);
    expect(await countUnreadForPlaylist(USER_A, plA.id)).toBe(1);
    expect(await countUnreadForPlaylist(USER_A, plB.id)).toBe(1);

    const before = Date.now();
    const result = await markLibraryRead(global.testPrisma, USER_A);
    const after = Date.now();

    expect(result).toEqual({ standaloneCount: 2, playlistCount: 2 });

    expect(await countUnreadStandalone(USER_A)).toBe(0);
    expect(await countUnreadForPlaylist(USER_A, plA.id)).toBe(0);
    expect(await countUnreadForPlaylist(USER_A, plB.id)).toBe(0);

    for (const plId of [plA.id, plB.id]) {
      const { read_at } = await global.testPrisma.playlist.findUniqueOrThrow({
        where: { id: plId },
        select: { read_at: true },
      });
      expect(read_at!.getTime()).toBeGreaterThanOrEqual(before);
      expect(read_at!.getTime()).toBeLessThanOrEqual(after + 1000);
    }
  });

  it('does not touch another user’s playlists or standalone videos', async () => {
    const v = await createVideo({ channelSourceId: 'ml_cross', videoSourceId: 'ml_cross_v' });
    await global.testPrisma.standaloneVideo.create({
      data: { user_id: USER_B, video_id: v.id },
    });
    const theirPlaylist = await global.testPrisma.playlist.create({
      data: {
        user_id: USER_B,
        source_id: 'PL_ml_theirs',
        name: 'Theirs',
        read_at: null,
        items: { create: [{ video_id: v.id, sort_order: 0 }] },
      },
    });

    const result = await markLibraryRead(global.testPrisma, USER_A);
    expect(result).toEqual({ standaloneCount: 0, playlistCount: 0 });

    const theirConsumption = await global.testPrisma.userVideoConsumption.findMany({
      where: { user_id: USER_B },
    });
    expect(theirConsumption).toHaveLength(0);

    const theirPlaylistAfter = await global.testPrisma.playlist.findUniqueOrThrow({
      where: { id: theirPlaylist.id },
      select: { read_at: true },
    });
    expect(theirPlaylistAfter.read_at).toBeNull();
  });
});
