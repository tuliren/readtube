import '@tests/integration-tests';

import {
  applyBulk,
  archiveVideo,
  assertUserCanTouchVideo,
  saveVideo,
  snoozeVideo,
  starVideo,
  unarchiveVideo,
  unsaveVideo,
  unsnoozeVideo,
  unstarVideo,
} from '@/lib/inbox/triageActions';

// The prod module pulls the shared `prisma` singleton, which we rebind to
// testPrisma at setup time via `@tests/integration-tests`. Keep the alias
// local for readability.
const db = global.testPrisma;

async function seedUserVideo(opts: {
  userSourceId: string;
  channelSourceId: string;
  videoSourceId: string;
}) {
  const { userSourceId, channelSourceId, videoSourceId } = opts;

  await db.user.create({
    data: {
      source_id: userSourceId,
      name: 'Test User',
      email: `${userSourceId}@example.com`,
    },
  });

  const channel = await db.channel.create({
    data: {
      source_id: channelSourceId,
      name: `Channel ${channelSourceId}`,
      rss_url: `https://example.com/${channelSourceId}.xml`,
    },
  });

  const video = await db.video.create({
    data: {
      channel_id: channel.id,
      source_id: videoSourceId,
      title: `Video ${videoSourceId}`,
      published_at: new Date('2026-01-01T00:00:00Z'),
    },
  });

  await db.userSubscription.create({
    data: { user_id: userSourceId, channel_id: channel.id },
  });

  return { channelId: channel.id, videoId: video.id };
}

beforeEach(async () => {
  await db.userVideoConsumption.deleteMany();
  await db.videoStar.deleteMany();
  await db.videoSave.deleteMany();
  await db.videoArchive.deleteMany();
  await db.videoSnooze.deleteMany();
  await db.userSubscription.deleteMany();
  await db.video.deleteMany();
  await db.channel.deleteMany();
  await db.user.deleteMany();
});

describe('assertUserCanTouchVideo', () => {
  it('returns true when user is subscribed to the video channel', async () => {
    const { videoId } = await seedUserVideo({
      userSourceId: 'user_owner',
      channelSourceId: 'chan1',
      videoSourceId: 'vid1',
    });

    const ok = await assertUserCanTouchVideo({ userId: 'user_owner', videoId });
    expect(ok).toBe(true);
  });

  it('returns false for IDOR attempt from a different user', async () => {
    const { videoId } = await seedUserVideo({
      userSourceId: 'user_owner',
      channelSourceId: 'chan1',
      videoSourceId: 'vid1',
    });

    await db.user.create({
      data: { source_id: 'user_intruder', name: 'Intruder', email: 'intruder@example.com' },
    });

    const ok = await assertUserCanTouchVideo({ userId: 'user_intruder', videoId });
    expect(ok).toBe(false);
  });
});

describe('toggles are idempotent', () => {
  it.each([
    {
      action: 'star',
      set: starVideo,
      unset: unstarVideo,
      count: (userId: string, videoId: string) =>
        db.videoStar.count({ where: { user_id: userId, video_id: videoId } }),
    },
    {
      action: 'save',
      set: saveVideo,
      unset: unsaveVideo,
      count: (userId: string, videoId: string) =>
        db.videoSave.count({ where: { user_id: userId, video_id: videoId } }),
    },
    {
      action: 'archive',
      set: archiveVideo,
      unset: unarchiveVideo,
      count: (userId: string, videoId: string) =>
        db.videoArchive.count({ where: { user_id: userId, video_id: videoId } }),
    },
  ])('$action set twice and unset twice is a no-op', async ({ set, unset, count }) => {
    const { videoId } = await seedUserVideo({
      userSourceId: 'user1',
      channelSourceId: 'chan1',
      videoSourceId: 'vid1',
    });

    await set('user1', videoId);
    await set('user1', videoId);
    expect(await count('user1', videoId)).toBe(1);

    await unset('user1', videoId);
    await unset('user1', videoId);
    expect(await count('user1', videoId)).toBe(0);
  });
});

describe('snoozeVideo', () => {
  it('updates snooze_until on a second call', async () => {
    const { videoId } = await seedUserVideo({
      userSourceId: 'user1',
      channelSourceId: 'chan1',
      videoSourceId: 'vid1',
    });

    const first = new Date('2026-02-01T00:00:00Z');
    const second = new Date('2026-03-01T00:00:00Z');

    await snoozeVideo('user1', videoId, first);
    await snoozeVideo('user1', videoId, second);

    const row = await db.videoSnooze.findFirst({ where: { user_id: 'user1', video_id: videoId } });
    expect(row?.snooze_until.toISOString()).toEqual(second.toISOString());
  });

  it('unsnooze removes the row', async () => {
    const { videoId } = await seedUserVideo({
      userSourceId: 'user1',
      channelSourceId: 'chan1',
      videoSourceId: 'vid1',
    });

    await snoozeVideo('user1', videoId, new Date('2026-02-01T00:00:00Z'));
    await unsnoozeVideo('user1', videoId);

    const count = await db.videoSnooze.count({ where: { user_id: 'user1', video_id: videoId } });
    expect(count).toBe(0);
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
    const otherChannel = await db.channel.create({
      data: { source_id: 'chan2', name: 'Other', rss_url: 'https://example.com/2.xml' },
    });
    const otherVideo = await db.video.create({
      data: {
        channel_id: otherChannel.id,
        source_id: 'vid_other',
        title: 'Other',
        published_at: new Date('2026-01-01'),
      },
    });

    const result = await applyBulk('owner', [owner.videoId, otherVideo.id], { type: 'star' });
    expect(result.affected).toBe(1);

    const stars = await db.videoStar.findMany({ where: { user_id: 'owner' } });
    expect(stars.map((s) => s.video_id)).toEqual([owner.videoId]);
  });

  it('mark_read creates UserVideoConsumption rows', async () => {
    const { videoId } = await seedUserVideo({
      userSourceId: 'user1',
      channelSourceId: 'chan1',
      videoSourceId: 'vid1',
    });

    await applyBulk('user1', [videoId], { type: 'mark_read' });
    const count = await db.userVideoConsumption.count({
      where: { user_id: 'user1', video_id: videoId },
    });
    expect(count).toBe(1);
  });

  it('is a no-op for empty videoIds', async () => {
    const result = await applyBulk('user1', [], { type: 'star' });
    expect(result.affected).toBe(0);
  });
});
