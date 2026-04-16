import '@tests/integration-tests';

import {
  applyBulk,
  archiveVideo,
  assertUserCanTouchVideo,
  saveVideo,
  starVideo,
  unarchiveVideo,
  unsaveVideo,
  unstarVideo,
} from '@/lib/inbox/triageActions';

async function seedUserVideo(opts: {
  userSourceId: string;
  channelSourceId: string;
  videoSourceId: string;
}) {
  const { userSourceId, channelSourceId, videoSourceId } = opts;

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

  const video = await global.testPrisma.video.create({
    data: {
      channel_id: channel.id,
      source_id: videoSourceId,
      title: `Video ${videoSourceId}`,
      published_at: new Date('2026-01-01T00:00:00Z'),
    },
  });

  await global.testPrisma.userSubscription.create({
    data: { user_id: userSourceId, channel_id: channel.id },
  });

  return { channelId: channel.id, videoId: video.id };
}

beforeEach(async () => {
  await global.testPrisma.userVideoConsumption.deleteMany();
  await global.testPrisma.videoStar.deleteMany();
  await global.testPrisma.videoSave.deleteMany();
  await global.testPrisma.videoArchive.deleteMany();
  await global.testPrisma.playlistVideo.deleteMany();
  await global.testPrisma.playlist.deleteMany();
  await global.testPrisma.standaloneVideo.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
});

describe('assertUserCanTouchVideo', () => {
  it('returns true when user is subscribed to the video channel', async () => {
    const { videoId } = await seedUserVideo({
      userSourceId: 'user_owner',
      channelSourceId: 'chan1',
      videoSourceId: 'vid1',
    });

    const ok = await assertUserCanTouchVideo(global.testPrisma, {
      userId: 'user_owner',
      videoId,
    });
    expect(ok).toBe(true);
  });

  it('returns false for IDOR attempt from a different user', async () => {
    const { videoId } = await seedUserVideo({
      userSourceId: 'user_owner',
      channelSourceId: 'chan1',
      videoSourceId: 'vid1',
    });

    await global.testPrisma.user.create({
      data: { source_id: 'user_intruder', name: 'Intruder', email: 'intruder@example.com' },
    });

    const ok = await assertUserCanTouchVideo(global.testPrisma, {
      userId: 'user_intruder',
      videoId,
    });
    expect(ok).toBe(false);
  });

  it('returns true when the user has a StandaloneVideo row for an unsubscribed channel', async () => {
    // Seed a user with an unsubscribed video (no UserSubscription).
    await global.testPrisma.user.create({
      data: { source_id: 'user_lib', name: 'Lib', email: 'lib@example.com' },
    });
    const channel = await global.testPrisma.channel.create({
      data: {
        source_id: 'UC_shadow',
        name: 'Shadow',
        rss_url: 'https://example.com/shadow.xml',
      },
    });
    const video = await global.testPrisma.video.create({
      data: {
        channel_id: channel.id,
        source_id: 'vid_shadow',
        title: 'Shadow Video',
        published_at: new Date('2026-01-01T00:00:00Z'),
      },
    });
    await global.testPrisma.standaloneVideo.create({
      data: { user_id: 'user_lib', video_id: video.id },
    });

    const ok = await assertUserCanTouchVideo(global.testPrisma, {
      userId: 'user_lib',
      videoId: video.id,
    });
    expect(ok).toBe(true);
  });

  it('returns true when the video is in one of the user\u2019s playlists', async () => {
    await global.testPrisma.user.create({
      data: { source_id: 'user_pl', name: 'Pl', email: 'pl@example.com' },
    });
    const channel = await global.testPrisma.channel.create({
      data: {
        source_id: 'UC_other',
        name: 'Other',
        rss_url: 'https://example.com/other.xml',
      },
    });
    const video = await global.testPrisma.video.create({
      data: {
        channel_id: channel.id,
        source_id: 'vid_pl',
        title: 'Playlist Video',
        published_at: new Date('2026-01-01T00:00:00Z'),
      },
    });
    const playlist = await global.testPrisma.playlist.create({
      data: { user_id: 'user_pl', source_id: 'PLtest', name: 'My List' },
    });
    await global.testPrisma.playlistVideo.create({
      data: { playlist_id: playlist.id, video_id: video.id },
    });

    const ok = await assertUserCanTouchVideo(global.testPrisma, {
      userId: 'user_pl',
      videoId: video.id,
    });
    expect(ok).toBe(true);
  });

  it('returns false when the video is in ANOTHER user\u2019s playlist', async () => {
    await global.testPrisma.user.create({
      data: { source_id: 'user_a', name: 'A', email: 'a@example.com' },
    });
    await global.testPrisma.user.create({
      data: { source_id: 'user_b', name: 'B', email: 'b@example.com' },
    });
    const channel = await global.testPrisma.channel.create({
      data: {
        source_id: 'UC_xx',
        name: 'xx',
        rss_url: 'https://example.com/xx.xml',
      },
    });
    const video = await global.testPrisma.video.create({
      data: {
        channel_id: channel.id,
        source_id: 'vid_xx',
        title: 'XX',
        published_at: new Date('2026-01-01T00:00:00Z'),
      },
    });
    // B puts the video in their playlist; A has no access path.
    const plB = await global.testPrisma.playlist.create({
      data: { user_id: 'user_b', source_id: 'PLB', name: 'B list' },
    });
    await global.testPrisma.playlistVideo.create({
      data: { playlist_id: plB.id, video_id: video.id },
    });

    const ok = await assertUserCanTouchVideo(global.testPrisma, {
      userId: 'user_a',
      videoId: video.id,
    });
    expect(ok).toBe(false);
  });
});

describe('applyBulk remove_from_library', () => {
  it('deletes StandaloneVideo and user playlist memberships; leaves other users\u2019 playlists alone', async () => {
    // User A has two videos: one via StandaloneVideo, one via their playlist.
    // User B also has the first video in their playlist.
    await global.testPrisma.user.create({
      data: { source_id: 'user_a', name: 'A', email: 'a@example.com' },
    });
    await global.testPrisma.user.create({
      data: { source_id: 'user_b', name: 'B', email: 'b@example.com' },
    });
    const channel = await global.testPrisma.channel.create({
      data: {
        source_id: 'UC_t',
        name: 't',
        rss_url: 'https://example.com/t.xml',
      },
    });
    const video1 = await global.testPrisma.video.create({
      data: {
        channel_id: channel.id,
        source_id: 'v1',
        title: 'V1',
        published_at: new Date('2026-01-01T00:00:00Z'),
      },
    });
    const video2 = await global.testPrisma.video.create({
      data: {
        channel_id: channel.id,
        source_id: 'v2',
        title: 'V2',
        published_at: new Date('2026-01-02T00:00:00Z'),
      },
    });
    await global.testPrisma.standaloneVideo.create({
      data: { user_id: 'user_a', video_id: video1.id },
    });
    const plA = await global.testPrisma.playlist.create({
      data: { user_id: 'user_a', source_id: 'PLA', name: 'A list' },
    });
    await global.testPrisma.playlistVideo.create({
      data: { playlist_id: plA.id, video_id: video2.id },
    });
    const plB = await global.testPrisma.playlist.create({
      data: { user_id: 'user_b', source_id: 'PLB', name: 'B list' },
    });
    await global.testPrisma.playlistVideo.create({
      data: { playlist_id: plB.id, video_id: video1.id },
    });

    const result = await applyBulk(global.testPrisma, 'user_a', [video1.id, video2.id], {
      type: 'remove_from_library',
    });
    expect(result.affected).toBe(2);

    // A loses StandaloneVideo + playlist memberships.
    expect(await global.testPrisma.standaloneVideo.count({ where: { user_id: 'user_a' } })).toBe(0);
    expect(await global.testPrisma.playlistVideo.count({ where: { playlist_id: plA.id } })).toBe(0);
    // B still has their playlist entry for video1.
    expect(await global.testPrisma.playlistVideo.count({ where: { playlist_id: plB.id } })).toBe(1);
    // Underlying Video rows survive.
    expect(await global.testPrisma.video.count()).toBe(2);
  });
});

describe('toggles are idempotent', () => {
  it.each([
    {
      action: 'star',
      set: starVideo,
      unset: unstarVideo,
      count: (userId: string, videoId: string) =>
        global.testPrisma.videoStar.count({ where: { user_id: userId, video_id: videoId } }),
    },
    {
      action: 'save',
      set: saveVideo,
      unset: unsaveVideo,
      count: (userId: string, videoId: string) =>
        global.testPrisma.videoSave.count({ where: { user_id: userId, video_id: videoId } }),
    },
    {
      action: 'archive',
      set: archiveVideo,
      unset: unarchiveVideo,
      count: (userId: string, videoId: string) =>
        global.testPrisma.videoArchive.count({ where: { user_id: userId, video_id: videoId } }),
    },
  ])('$action set twice and unset twice is a no-op', async ({ set, unset, count }) => {
    const { videoId } = await seedUserVideo({
      userSourceId: 'user1',
      channelSourceId: 'chan1',
      videoSourceId: 'vid1',
    });

    await set(global.testPrisma, 'user1', videoId);
    await set(global.testPrisma, 'user1', videoId);
    expect(await count('user1', videoId)).toBe(1);

    await unset(global.testPrisma, 'user1', videoId);
    await unset(global.testPrisma, 'user1', videoId);
    expect(await count('user1', videoId)).toBe(0);
  });
});

describe('applyBulk', () => {
  it('only touches videos the user owns', async () => {
    const owner = await seedUserVideo({
      userSourceId: 'owner',
      channelSourceId: 'chan1',
      videoSourceId: 'vid1',
    });

    // A second channel + video the owner does NOT subscribe to
    const otherChannel = await global.testPrisma.channel.create({
      data: { source_id: 'chan2', name: 'Other', rss_url: 'https://example.com/2.xml' },
    });
    const otherVideo = await global.testPrisma.video.create({
      data: {
        channel_id: otherChannel.id,
        source_id: 'vid_other',
        title: 'Other',
        published_at: new Date('2026-01-01'),
      },
    });

    const result = await applyBulk(global.testPrisma, 'owner', [owner.videoId, otherVideo.id], {
      type: 'star',
    });
    expect(result.affected).toBe(1);

    const stars = await global.testPrisma.videoStar.findMany({ where: { user_id: 'owner' } });
    expect(stars.map((s) => s.video_id)).toEqual([owner.videoId]);
  });

  it('mark_read creates UserVideoConsumption rows', async () => {
    const { videoId } = await seedUserVideo({
      userSourceId: 'user1',
      channelSourceId: 'chan1',
      videoSourceId: 'vid1',
    });

    await applyBulk(global.testPrisma, 'user1', [videoId], { type: 'mark_read' });
    const count = await global.testPrisma.userVideoConsumption.count({
      where: { user_id: 'user1', video_id: videoId },
    });
    expect(count).toBe(1);
  });

  it('is a no-op for empty videoIds', async () => {
    const result = await applyBulk(global.testPrisma, 'user1', [], { type: 'star' });
    expect(result.affected).toBe(0);
  });
});
