import '@tests/integration-tests';

import { unsubscribeChannelForUser } from '@/lib/subscriptions';

interface SetupResult {
  userId: string;
  channelId: string;
  videoIds: string[];
}

async function setup(opts: {
  userSourceId: string;
  channelSourceId: string;
  videoCount: number;
}): Promise<SetupResult> {
  const { userSourceId, channelSourceId, videoCount } = opts;

  await global.testPrisma.user.create({
    data: {
      source_id: userSourceId,
      name: 'Test User',
      email: `${userSourceId}@example.com`,
    },
  });

  const channel = await global.testPrisma.channel.create({
    data: {
      source_id: channelSourceId,
      name: `Channel ${channelSourceId}`,
      rss_url: `https://example.com/${channelSourceId}.xml`,
    },
  });

  const videoIds: string[] = [];
  const baseMs = new Date('2026-01-01T00:00:00Z').getTime();
  for (let i = 0; i < videoCount; i++) {
    const video = await global.testPrisma.video.create({
      data: {
        channel_id: channel.id,
        source_id: `${channelSourceId}_video_${i}`,
        title: `Video ${i}`,
        published_at: new Date(baseMs - i * 60 * 60 * 1000),
      },
    });
    videoIds.push(video.id);
  }

  await global.testPrisma.userSubscription.create({
    data: { user_id: userSourceId, channel_id: channel.id },
  });

  return { userId: userSourceId, channelId: channel.id, videoIds };
}

async function seedTriageForAll(userId: string, videoIds: string[]) {
  for (const videoId of videoIds) {
    await global.testPrisma.userVideoConsumption.create({
      data: { user_id: userId, video_id: videoId },
    });
    await global.testPrisma.videoStar.create({
      data: { user_id: userId, video_id: videoId },
    });
    await global.testPrisma.videoSave.create({
      data: { user_id: userId, video_id: videoId },
    });
    await global.testPrisma.videoArchive.create({
      data: { user_id: userId, video_id: videoId },
    });
    await global.testPrisma.note.create({
      data: { user_id: userId, video_id: videoId, body: 'note body' },
    });
  }
}

beforeEach(async () => {
  await global.testPrisma.note.deleteMany();
  await global.testPrisma.videoArchive.deleteMany();
  await global.testPrisma.videoSave.deleteMany();
  await global.testPrisma.videoStar.deleteMany();
  await global.testPrisma.userVideoConsumption.deleteMany();
  await global.testPrisma.playlistVideo.deleteMany();
  await global.testPrisma.playlist.deleteMany();
  await global.testPrisma.standaloneVideo.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
});

describe('unsubscribeChannelForUser', () => {
  it('returns null when the user is not subscribed to the channel', async () => {
    await global.testPrisma.user.create({
      data: { source_id: 'u_not_sub', email: 'u_not_sub@example.com', name: 'X' },
    });
    const channel = await global.testPrisma.channel.create({
      data: {
        source_id: 'ch_not_sub',
        name: 'Not subscribed',
        rss_url: 'https://example.com/ns.xml',
      },
    });

    const result = await unsubscribeChannelForUser(global.testPrisma, 'u_not_sub', channel.id);
    expect(result).toBeNull();
  });

  it('wipes triage state for channel-only videos', async () => {
    const { userId, channelId, videoIds } = await setup({
      userSourceId: 'u_plain',
      channelSourceId: 'ch_plain',
      videoCount: 3,
    });
    await seedTriageForAll(userId, videoIds);

    const result = await unsubscribeChannelForUser(global.testPrisma, userId, channelId);
    expect(result).toEqual({ cleanedVideoCount: 3 });

    expect(
      await global.testPrisma.userSubscription.findFirst({
        where: { user_id: userId, channel_id: channelId },
      })
    ).toBeNull();

    const where = { user_id: userId, video_id: { in: videoIds } };
    expect(await global.testPrisma.userVideoConsumption.findMany({ where })).toEqual([]);
    expect(await global.testPrisma.videoStar.findMany({ where })).toEqual([]);
    expect(await global.testPrisma.videoSave.findMany({ where })).toEqual([]);
    expect(await global.testPrisma.videoArchive.findMany({ where })).toEqual([]);
    expect(await global.testPrisma.note.findMany({ where })).toEqual([]);

    const videos = await global.testPrisma.video.findMany({ where: { id: { in: videoIds } } });
    expect(videos.length).toBe(3);
  });

  it('preserves triage state for videos the user also added as standalone', async () => {
    const { userId, channelId, videoIds } = await setup({
      userSourceId: 'u_standalone',
      channelSourceId: 'ch_standalone',
      videoCount: 3,
    });
    await seedTriageForAll(userId, videoIds);

    const retainedVideoId = videoIds[0];
    const cleanedVideoIds = videoIds.slice(1);
    await global.testPrisma.standaloneVideo.create({
      data: { user_id: userId, video_id: retainedVideoId },
    });

    const result = await unsubscribeChannelForUser(global.testPrisma, userId, channelId);
    expect(result).toEqual({ cleanedVideoCount: 2 });

    expect(
      await global.testPrisma.standaloneVideo.findFirst({
        where: { user_id: userId, video_id: retainedVideoId },
      })
    ).not.toBeNull();

    const survivorWhere = { user_id: userId, video_id: retainedVideoId };
    const cleanedWhere = { user_id: userId, video_id: { in: cleanedVideoIds } };

    expect(
      await global.testPrisma.userVideoConsumption.findFirst({ where: survivorWhere })
    ).not.toBeNull();
    expect(await global.testPrisma.userVideoConsumption.findMany({ where: cleanedWhere })).toEqual(
      []
    );

    expect(await global.testPrisma.videoStar.findFirst({ where: survivorWhere })).not.toBeNull();
    expect(await global.testPrisma.videoStar.findMany({ where: cleanedWhere })).toEqual([]);

    expect(await global.testPrisma.videoSave.findFirst({ where: survivorWhere })).not.toBeNull();
    expect(await global.testPrisma.videoSave.findMany({ where: cleanedWhere })).toEqual([]);

    expect(await global.testPrisma.videoArchive.findFirst({ where: survivorWhere })).not.toBeNull();
    expect(await global.testPrisma.videoArchive.findMany({ where: cleanedWhere })).toEqual([]);

    expect(await global.testPrisma.note.findFirst({ where: survivorWhere })).not.toBeNull();
    expect(await global.testPrisma.note.findMany({ where: cleanedWhere })).toEqual([]);
  });

  it('preserves triage state for videos that belong to one of the user’s playlists', async () => {
    const { userId, channelId, videoIds } = await setup({
      userSourceId: 'u_playlist',
      channelSourceId: 'ch_playlist',
      videoCount: 3,
    });
    await seedTriageForAll(userId, videoIds);

    const retainedVideoId = videoIds[1];
    const cleanedVideoIds = videoIds.filter((v) => v !== retainedVideoId);
    const playlist = await global.testPrisma.playlist.create({
      data: {
        user_id: userId,
        source_id: 'pl_keep',
        name: 'Keep',
      },
    });
    await global.testPrisma.playlistVideo.create({
      data: { playlist_id: playlist.id, video_id: retainedVideoId },
    });

    const result = await unsubscribeChannelForUser(global.testPrisma, userId, channelId);
    expect(result).toEqual({ cleanedVideoCount: 2 });

    const survivorWhere = { user_id: userId, video_id: retainedVideoId };
    const cleanedWhere = { user_id: userId, video_id: { in: cleanedVideoIds } };

    expect(
      await global.testPrisma.userVideoConsumption.findFirst({ where: survivorWhere })
    ).not.toBeNull();
    expect(await global.testPrisma.userVideoConsumption.findMany({ where: cleanedWhere })).toEqual(
      []
    );

    expect(await global.testPrisma.videoStar.findFirst({ where: survivorWhere })).not.toBeNull();
    expect(await global.testPrisma.videoStar.findMany({ where: cleanedWhere })).toEqual([]);

    expect(await global.testPrisma.videoSave.findFirst({ where: survivorWhere })).not.toBeNull();
    expect(await global.testPrisma.videoSave.findMany({ where: cleanedWhere })).toEqual([]);

    expect(await global.testPrisma.videoArchive.findFirst({ where: survivorWhere })).not.toBeNull();
    expect(await global.testPrisma.videoArchive.findMany({ where: cleanedWhere })).toEqual([]);

    expect(await global.testPrisma.note.findFirst({ where: survivorWhere })).not.toBeNull();
    expect(await global.testPrisma.note.findMany({ where: cleanedWhere })).toEqual([]);

    expect(
      await global.testPrisma.playlistVideo.findFirst({
        where: { playlist_id: playlist.id, video_id: retainedVideoId },
      })
    ).not.toBeNull();
  });

  it('does not use another user’s playlist as a retention reason', async () => {
    const { userId, channelId, videoIds } = await setup({
      userSourceId: 'u_owner',
      channelSourceId: 'ch_cross_user',
      videoCount: 2,
    });
    await seedTriageForAll(userId, videoIds);

    // Second user puts one of the channel's videos in their own playlist.
    await global.testPrisma.user.create({
      data: { source_id: 'u_other', email: 'u_other@example.com', name: 'Other' },
    });
    const otherPlaylist = await global.testPrisma.playlist.create({
      data: {
        user_id: 'u_other',
        source_id: 'pl_other',
        name: 'Other’s playlist',
      },
    });
    await global.testPrisma.playlistVideo.create({
      data: { playlist_id: otherPlaylist.id, video_id: videoIds[0] },
    });

    const result = await unsubscribeChannelForUser(global.testPrisma, userId, channelId);
    // Both videos should still be cleaned — the other user's playlist
    // must not shield `u_owner`'s triage state.
    expect(result).toEqual({ cleanedVideoCount: 2 });

    const stars = await global.testPrisma.videoStar.findMany({ where: { user_id: userId } });
    expect(stars).toEqual([]);
  });

  it('does not touch another user’s triage state on the shared channel', async () => {
    const { userId, channelId, videoIds } = await setup({
      userSourceId: 'u_a',
      channelSourceId: 'ch_shared_iso',
      videoCount: 2,
    });
    await seedTriageForAll(userId, videoIds);

    // Second user subscribes to the same channel and gets the same state.
    await global.testPrisma.user.create({
      data: { source_id: 'u_b', email: 'u_b@example.com', name: 'B' },
    });
    await global.testPrisma.userSubscription.create({
      data: { user_id: 'u_b', channel_id: channelId },
    });
    await seedTriageForAll('u_b', videoIds);

    await unsubscribeChannelForUser(global.testPrisma, userId, channelId);

    // User B's rows are intact.
    const bWhere = { user_id: 'u_b' };
    expect((await global.testPrisma.userVideoConsumption.findMany({ where: bWhere })).length).toBe(
      2
    );
    expect((await global.testPrisma.videoStar.findMany({ where: bWhere })).length).toBe(2);
    expect((await global.testPrisma.videoSave.findMany({ where: bWhere })).length).toBe(2);
    expect((await global.testPrisma.videoArchive.findMany({ where: bWhere })).length).toBe(2);
    expect((await global.testPrisma.note.findMany({ where: bWhere })).length).toBe(2);

    const subB = await global.testPrisma.userSubscription.findFirst({
      where: { user_id: 'u_b', channel_id: channelId },
    });
    expect(subB).not.toBeNull();
  });

  it('handles a channel with no videos', async () => {
    await global.testPrisma.user.create({
      data: { source_id: 'u_empty', email: 'u_empty@example.com', name: 'Empty' },
    });
    const channel = await global.testPrisma.channel.create({
      data: {
        source_id: 'ch_empty',
        name: 'Empty',
        rss_url: 'https://example.com/empty.xml',
      },
    });
    await global.testPrisma.userSubscription.create({
      data: { user_id: 'u_empty', channel_id: channel.id },
    });

    const result = await unsubscribeChannelForUser(global.testPrisma, 'u_empty', channel.id);
    expect(result).toEqual({ cleanedVideoCount: 0 });

    expect(
      await global.testPrisma.userSubscription.findFirst({
        where: { user_id: 'u_empty', channel_id: channel.id },
      })
    ).toBeNull();
  });
});
