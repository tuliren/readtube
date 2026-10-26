import '@tests/integration-tests';

import { loadInboxVideos } from '@/lib/inbox/loadVideos';

const USER_ID = 'u_standalone_library';

async function createUser(sourceId: string) {
  await global.testPrisma.user.create({
    data: { source_id: sourceId, email: `${sourceId}@example.com`, name: sourceId },
  });
}

async function createChannelAndVideos(videoCount: number, prefix: string) {
  const channel = await global.testPrisma.channel.create({
    data: {
      source_id: `${prefix}_ch`,
      name: `Channel ${prefix}`,
      rss_url: `https://example.com/${prefix}.xml`,
    },
  });
  const baseMs = new Date('2026-01-01T00:00:00Z').getTime();
  const videos: { id: string }[] = [];
  for (let i = 0; i < videoCount; i++) {
    const v = await global.testPrisma.video.create({
      data: {
        channel_id: channel.id,
        source_id: `${prefix}_v${i}`,
        title: `${prefix} ${i}`,
        published_at: new Date(baseMs - i * 60 * 60 * 1000),
      },
      select: { id: true },
    });
    videos.push(v);
  }
  return { channelId: channel.id, videoIds: videos.map((v) => v.id) };
}

beforeEach(async () => {
  await global.testPrisma.userVideoConsumption.deleteMany();
  await global.testPrisma.playlistVideo.deleteMany();
  await global.testPrisma.playlist.deleteMany();
  await global.testPrisma.standaloneVideo.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
});

describe('loadInboxVideos (library: standalone)', () => {
  it('includes a standalone video even when it also belongs to one of the user’s playlists', async () => {
    await createUser(USER_ID);
    const { videoIds } = await createChannelAndVideos(2, 'sl_overlap');
    const [standaloneOnlyId, overlapId] = videoIds;

    await global.testPrisma.standaloneVideo.createMany({
      data: [
        { user_id: USER_ID, video_id: standaloneOnlyId },
        { user_id: USER_ID, video_id: overlapId },
      ],
    });
    await global.testPrisma.playlist.create({
      data: {
        user_id: USER_ID,
        source_id: 'pl_overlap',
        name: 'Overlap',
        items: { create: [{ video_id: overlapId, sort_order: 0 }] },
      },
    });

    const result = await loadInboxVideos(global.testPrisma, USER_ID, { library: 'standalone' });

    const returnedIds = result.videos.map((v) => v.id).sort();
    expect(returnedIds).toEqual([standaloneOnlyId, overlapId].sort());
    expect(result.total).toBe(2);
  });

  it('still excludes videos another user filed into their own playlist', async () => {
    await createUser(USER_ID);
    await createUser('u_other');
    const { videoIds } = await createChannelAndVideos(1, 'sl_cross');
    const [videoId] = videoIds;

    await global.testPrisma.standaloneVideo.create({
      data: { user_id: USER_ID, video_id: videoId },
    });
    // Another user filing the same video into their own playlist must
    // not affect our standalone list.
    await global.testPrisma.playlist.create({
      data: {
        user_id: 'u_other',
        source_id: 'pl_other',
        name: 'Other',
        items: { create: [{ video_id: videoId, sort_order: 0 }] },
      },
    });

    const result = await loadInboxVideos(global.testPrisma, USER_ID, { library: 'standalone' });
    expect(result.videos.map((v) => v.id)).toEqual([videoId]);
    expect(result.total).toBe(1);
  });

  it('applies the playlist watermark so an overlap video is marked read when the playlist is marked read', async () => {
    await createUser(USER_ID);
    const { videoIds } = await createChannelAndVideos(1, 'sl_watermark');
    const [videoId] = videoIds;

    await global.testPrisma.standaloneVideo.create({
      data: { user_id: USER_ID, video_id: videoId },
    });
    const watermark = new Date('2026-06-01T00:00:00Z');
    await global.testPrisma.playlist.create({
      data: {
        user_id: USER_ID,
        source_id: 'pl_wm',
        name: 'WM',
        read_at: watermark,
        items: { create: [{ video_id: videoId, sort_order: 0 }] },
      },
    });

    const result = await loadInboxVideos(global.testPrisma, USER_ID, { library: 'standalone' });
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].id).toBe(videoId);
    expect(result.videos[0].readAt).not.toBeNull();
  });
});

describe('loadInboxVideos (library search)', () => {
  async function seedTitled(titles: string[]) {
    const channel = await global.testPrisma.channel.create({
      data: { source_id: 'ls_ch', name: 'Channel ls', rss_url: 'https://example.com/ls.xml' },
    });
    const ids: string[] = [];
    for (let i = 0; i < titles.length; i++) {
      const v = await global.testPrisma.video.create({
        data: { channel_id: channel.id, source_id: `ls_v${i}`, title: titles[i] },
        select: { id: true },
      });
      ids.push(v.id);
    }
    return ids;
  }

  const TITLES = [
    'Alpha gardening tips',
    'Beta cooking basics',
    'Gamma gardening tools',
    '园艺入门',
  ];

  it.each([
    { q: 'gardening', expected: [2, 0] },
    { q: '园艺', expected: [3] },
    { q: 'nomatchhere', expected: [] },
  ])('narrows the standalone list by q=$q and keeps insertion order', async ({ q, expected }) => {
    await createUser(USER_ID);
    const ids = await seedTitled(TITLES);
    // Insert one at a time so created_at (newest first) is deterministic.
    for (const videoId of ids) {
      await global.testPrisma.standaloneVideo.create({
        data: { user_id: USER_ID, video_id: videoId },
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const result = await loadInboxVideos(global.testPrisma, USER_ID, { library: 'standalone', q });

    const expectedIds = expected.map((i) => ids[i]);
    expect(result.videos.map((v) => v.id)).toEqual(expectedIds);
    expect(result.total).toBe(expectedIds.length);
  });

  it.each([
    { q: 'gardening', expected: [2, 0] },
    { q: 'cooking', expected: [] },
  ])('narrows the playlist by q=$q and keeps sort_order', async ({ q, expected }) => {
    await createUser(USER_ID);
    const ids = await seedTitled(TITLES);
    // Beta is a standalone video, not in the playlist, so it never
    // leaks into the playlist's results.
    const playlist = await global.testPrisma.playlist.create({
      data: {
        user_id: USER_ID,
        source_id: 'pl_search',
        name: 'Search',
        items: {
          create: [
            { video_id: ids[2], sort_order: 0 },
            { video_id: ids[3], sort_order: 1 },
            { video_id: ids[0], sort_order: 2 },
          ],
        },
      },
    });
    await global.testPrisma.standaloneVideo.create({
      data: { user_id: USER_ID, video_id: ids[1] },
    });

    const result = await loadInboxVideos(global.testPrisma, USER_ID, {
      library: 'playlist',
      playlistId: playlist.id,
      q,
    });

    const expectedIds = expected.map((i) => ids[i]);
    expect(result.videos.map((v) => v.id)).toEqual(expectedIds);
    expect(result.total).toBe(expectedIds.length);
  });
});
