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
