import '@tests/integration-tests';

import {
  computeInitialReadAt,
  countUnreadVideos,
  getSubscribedChannelsWithUnread,
  markAllReadForUser,
} from '@/lib/subscriptions';

// Helper: create a user, a channel, and N videos with descending published_at.
// `oldestFirstOffsetMs` is the gap between consecutive videos.
async function setupChannelWithVideos(opts: {
  userSourceId: string;
  channelSourceId: string;
  videoCount: number;
}) {
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

  // Most-recent video published "now", each older video one hour earlier.
  // We use a fixed base so timestamps are deterministic across runs.
  const baseMs = new Date('2026-01-01T00:00:00Z').getTime();
  const oneHourMs = 60 * 60 * 1000;
  for (let i = 0; i < videoCount; i++) {
    await global.testPrisma.video.create({
      data: {
        channel_id: channel.id,
        source_id: `${channelSourceId}_video_${i}`,
        title: `Video ${i}`,
        published_at: new Date(baseMs - i * oneHourMs),
      },
    });
  }

  await global.testPrisma.userSubscription.create({
    data: { user_id: userSourceId, channel_id: channel.id },
  });

  return { channelId: channel.id };
}

beforeEach(async () => {
  // Cleanup respects FK cascades: deleting Users and Channels wipes
  // UserSubscription, UserVideoConsumption, Video, etc.
  await global.testPrisma.userVideoConsumption.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
});

describe('computeInitialReadAt', () => {
  describe("mode 'all_new'", () => {
    it.each([{ videoCount: 0 }, { videoCount: 3 }, { videoCount: 10 }])(
      'returns null regardless of video count ($videoCount videos)',
      async ({ videoCount }) => {
        const { channelId } = await setupChannelWithVideos({
          userSourceId: 'u_all_new',
          channelSourceId: `ch_all_new_${videoCount}`,
          videoCount,
        });

        const result = await computeInitialReadAt(global.testPrisma, channelId, 'all_new');
        expect(result).toBeNull();
      }
    );
  });

  describe("mode 'none_new'", () => {
    it('returns a recent timestamp regardless of video count', async () => {
      const { channelId } = await setupChannelWithVideos({
        userSourceId: 'u_none_new',
        channelSourceId: 'ch_none_new',
        videoCount: 5,
      });

      const before = Date.now();
      const result = await computeInitialReadAt(global.testPrisma, channelId, 'none_new');
      const after = Date.now();

      expect(result).not.toBeNull();
      expect(result!.getTime()).toBeGreaterThanOrEqual(before);
      expect(result!.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe("mode 'recent_n_new'", () => {
    it.each([
      { videoCount: 0, expectNull: true },
      { videoCount: 1, expectNull: true },
      { videoCount: 3, expectNull: true },
      { videoCount: 4, expectNull: false },
      { videoCount: 10, expectNull: false },
    ])(
      'with N=3 and $videoCount videos returns ${expectNull ? null : (N+1)th published_at}',
      async ({ videoCount, expectNull }) => {
        const { channelId } = await setupChannelWithVideos({
          userSourceId: `u_rnn_${videoCount}`,
          channelSourceId: `ch_rnn_${videoCount}`,
          videoCount,
        });

        const result = await computeInitialReadAt(global.testPrisma, channelId, 'recent_n_new', 3);

        if (expectNull) {
          expect(result).toBeNull();
        } else {
          // The 4th-most-recent video is at index 3 (0-based). Setup creates
          // videos with each older one 1 hour earlier from baseMs.
          const baseMs = new Date('2026-01-01T00:00:00Z').getTime();
          const expectedMs = baseMs - 3 * 60 * 60 * 1000;
          expect(result!.getTime()).toBe(expectedMs);
        }
      }
    );

    it('honors a custom recentCount', async () => {
      const { channelId } = await setupChannelWithVideos({
        userSourceId: 'u_rnn_custom',
        channelSourceId: 'ch_rnn_custom',
        videoCount: 10,
      });

      // Mark only the most recent 1 as unread.
      const result = await computeInitialReadAt(global.testPrisma, channelId, 'recent_n_new', 1);

      const baseMs = new Date('2026-01-01T00:00:00Z').getTime();
      const expectedMs = baseMs - 1 * 60 * 60 * 1000;
      expect(result!.getTime()).toBe(expectedMs);
    });
  });

  describe('integration with countUnreadVideos', () => {
    it.each([
      // For N=3:
      { videoCount: 0, expectedUnread: 0 },
      { videoCount: 2, expectedUnread: 2 }, // < N+1 → all unread
      { videoCount: 3, expectedUnread: 3 }, // == N → all unread (no cutoff)
      { videoCount: 4, expectedUnread: 3 }, // top 3 unread, 4th is the cutoff
      { videoCount: 10, expectedUnread: 3 }, // top 3 unread
    ])(
      'recent_n_new with $videoCount videos yields $expectedUnread unread',
      async ({ videoCount, expectedUnread }) => {
        const { channelId } = await setupChannelWithVideos({
          userSourceId: `u_int_${videoCount}`,
          channelSourceId: `ch_int_${videoCount}`,
          videoCount,
        });

        const initialReadAt = await computeInitialReadAt(
          global.testPrisma,
          channelId,
          'recent_n_new',
          3
        );
        await global.testPrisma.userSubscription.update({
          where: {
            subscription_unique_user_channel: {
              user_id: `u_int_${videoCount}`,
              channel_id: channelId,
            },
          },
          data: { read_at: initialReadAt },
        });

        const unread = await countUnreadVideos(
          global.testPrisma,
          `u_int_${videoCount}`,
          channelId,
          initialReadAt
        );
        expect(unread).toBe(expectedUnread);
      }
    );
  });
});

describe('markAllReadForUser', () => {
  it('returns null when channelId is provided but the user is not subscribed', async () => {
    await setupChannelWithVideos({
      userSourceId: 'u_mark1',
      channelSourceId: 'ch_mark1',
      videoCount: 5,
    });

    // A different channel the user does not subscribe to
    const otherChannel = await global.testPrisma.channel.create({
      data: {
        source_id: 'ch_other',
        name: 'Other channel',
        rss_url: 'https://example.com/other.xml',
      },
    });

    const result = await markAllReadForUser(global.testPrisma, 'u_mark1', otherChannel.id);
    expect(result).toBeNull();
  });

  it('marks a single channel as read by bumping its watermark only', async () => {
    const { channelId: channelA } = await setupChannelWithVideos({
      userSourceId: 'u_mark_single',
      channelSourceId: 'ch_mark_a',
      videoCount: 5,
    });
    const channelB = await global.testPrisma.channel.create({
      data: {
        source_id: 'ch_mark_b',
        name: 'Channel B',
        rss_url: 'https://example.com/b.xml',
      },
    });
    // Add channel B videos
    const baseMs = new Date('2026-01-01T00:00:00Z').getTime();
    for (let i = 0; i < 4; i++) {
      await global.testPrisma.video.create({
        data: {
          channel_id: channelB.id,
          source_id: `ch_mark_b_video_${i}`,
          title: `B ${i}`,
          published_at: new Date(baseMs - i * 60 * 60 * 1000),
        },
      });
    }
    // Subscribe to channel B with no watermark
    await global.testPrisma.userSubscription.create({
      data: { user_id: 'u_mark_single', channel_id: channelB.id },
    });

    const before = Date.now();
    const result = await markAllReadForUser(global.testPrisma, 'u_mark_single', channelA);
    const after = Date.now();

    expect(result).toEqual({ channels: 1 });

    // Channel A's subscription has a fresh watermark
    const subA = await global.testPrisma.userSubscription.findFirstOrThrow({
      where: { user_id: 'u_mark_single', channel_id: channelA },
    });
    expect(subA.read_at).not.toBeNull();
    expect(subA.read_at!.getTime()).toBeGreaterThanOrEqual(before);
    expect(subA.read_at!.getTime()).toBeLessThanOrEqual(after);

    // Channel B's subscription is untouched
    const subB = await global.testPrisma.userSubscription.findFirstOrThrow({
      where: { user_id: 'u_mark_single', channel_id: channelB.id },
    });
    expect(subB.read_at).toBeNull();

    // Counts: A = 0 unread, B = 4 unread
    expect(
      await countUnreadVideos(global.testPrisma, 'u_mark_single', channelA, subA.read_at)
    ).toBe(0);
    expect(
      await countUnreadVideos(global.testPrisma, 'u_mark_single', channelB.id, subB.read_at)
    ).toBe(4);
  });

  it('marks every subscription when channelId is omitted', async () => {
    // User with two channels, both with 5 videos each
    await global.testPrisma.user.create({
      data: { source_id: 'u_mark_all', email: 'mark_all@example.com', name: 'Mark All' },
    });
    const channels = await Promise.all(
      ['ch_all_a', 'ch_all_b'].map((sid) =>
        global.testPrisma.channel.create({
          data: { source_id: sid, name: sid, rss_url: `https://example.com/${sid}.xml` },
        })
      )
    );
    const baseMs = new Date('2026-01-01T00:00:00Z').getTime();
    for (const ch of channels) {
      for (let i = 0; i < 5; i++) {
        await global.testPrisma.video.create({
          data: {
            channel_id: ch.id,
            source_id: `${ch.source_id}_video_${i}`,
            title: `${ch.source_id} ${i}`,
            published_at: new Date(baseMs - i * 60 * 60 * 1000),
          },
        });
      }
      await global.testPrisma.userSubscription.create({
        data: { user_id: 'u_mark_all', channel_id: ch.id },
      });
    }

    const result = await markAllReadForUser(global.testPrisma, 'u_mark_all');
    expect(result).toEqual({ channels: 2 });

    const subs = await global.testPrisma.userSubscription.findMany({
      where: { user_id: 'u_mark_all' },
      orderBy: { channel_id: 'asc' },
    });
    expect(subs.length).toBe(2);
    for (const sub of subs) {
      expect(sub.read_at).not.toBeNull();
      const unread = await countUnreadVideos(
        global.testPrisma,
        'u_mark_all',
        sub.channel_id,
        sub.read_at
      );
      expect(unread).toBe(0);
    }
  });

  it('does not affect other users sharing the same channel', async () => {
    const { channelId } = await setupChannelWithVideos({
      userSourceId: 'u_a',
      channelSourceId: 'ch_shared',
      videoCount: 5,
    });
    // Second user subscribes to the same shared channel
    await global.testPrisma.user.create({
      data: { source_id: 'u_b', email: 'u_b@example.com', name: 'User B' },
    });
    await global.testPrisma.userSubscription.create({
      data: { user_id: 'u_b', channel_id: channelId },
    });

    // User A marks the channel as read
    await markAllReadForUser(global.testPrisma, 'u_a', channelId);

    // User A: watermark set, 0 unread
    const subA = await global.testPrisma.userSubscription.findFirstOrThrow({
      where: { user_id: 'u_a', channel_id: channelId },
    });
    expect(subA.read_at).not.toBeNull();
    expect(await countUnreadVideos(global.testPrisma, 'u_a', channelId, subA.read_at)).toBe(0);

    // User B: watermark untouched, all 5 still unread
    const subB = await global.testPrisma.userSubscription.findFirstOrThrow({
      where: { user_id: 'u_b', channel_id: channelId },
    });
    expect(subB.read_at).toBeNull();
    expect(await countUnreadVideos(global.testPrisma, 'u_b', channelId, subB.read_at)).toBe(5);
  });

  it('returns channels: 0 when the user has no subscriptions', async () => {
    await global.testPrisma.user.create({
      data: { source_id: 'u_lonely', email: 'lonely@example.com', name: 'Lonely' },
    });

    const result = await markAllReadForUser(global.testPrisma, 'u_lonely');
    expect(result).toEqual({ channels: 0 });
  });

  it('overwrites an existing watermark on a second mark-all-read call', async () => {
    const { channelId } = await setupChannelWithVideos({
      userSourceId: 'u_twice',
      channelSourceId: 'ch_twice',
      videoCount: 3,
    });

    await markAllReadForUser(global.testPrisma, 'u_twice', channelId);
    const sub1 = await global.testPrisma.userSubscription.findFirstOrThrow({
      where: { user_id: 'u_twice', channel_id: channelId },
    });
    const firstWatermark = sub1.read_at!;

    // Wait at least 1ms so the timestamps differ.
    await new Promise((resolve) => setTimeout(resolve, 5));

    await markAllReadForUser(global.testPrisma, 'u_twice', channelId);
    const sub2 = await global.testPrisma.userSubscription.findFirstOrThrow({
      where: { user_id: 'u_twice', channel_id: channelId },
    });
    expect(sub2.read_at!.getTime()).toBeGreaterThan(firstWatermark.getTime());
  });

  it('does not delete or modify existing UserVideoConsumption rows', async () => {
    const { channelId } = await setupChannelWithVideos({
      userSourceId: 'u_consume',
      channelSourceId: 'ch_consume',
      videoCount: 5,
    });
    // Pick the most recent video and explicitly mark it as read
    const recentVideo = await global.testPrisma.video.findFirstOrThrow({
      where: { channel_id: channelId },
      orderBy: { published_at: 'desc' },
    });
    await global.testPrisma.userVideoConsumption.create({
      data: { user_id: 'u_consume', video_id: recentVideo.id },
    });

    await markAllReadForUser(global.testPrisma, 'u_consume', channelId);

    // The consumption row should still exist
    const consumption = await global.testPrisma.userVideoConsumption.findFirst({
      where: { user_id: 'u_consume', video_id: recentVideo.id },
    });
    expect(consumption).not.toBeNull();
  });
});

describe('getSubscribedChannelsWithUnread', () => {
  it('returns an empty array when the user has no subscriptions', async () => {
    await global.testPrisma.user.create({
      data: { source_id: 'u_empty', email: 'u_empty@example.com', name: 'Empty' },
    });

    const result = await getSubscribedChannelsWithUnread(global.testPrisma, 'u_empty');
    expect(result).toEqual([]);
  });

  it('returns subscribed channels with unread counts respecting the watermark', async () => {
    const { channelId } = await setupChannelWithVideos({
      userSourceId: 'u_basic',
      channelSourceId: 'ch_basic',
      videoCount: 5,
    });

    // No watermark yet — all 5 videos are unread.
    let result = await getSubscribedChannelsWithUnread(global.testPrisma, 'u_basic');
    expect(result.length).toBe(1);
    expect(result[0].channel_id).toBe(channelId);
    expect(result[0].source_id).toBe('ch_basic');
    expect(result[0].name).toBe('Channel ch_basic');
    expect(result[0].read_at).toBeNull();
    expect(result[0].unread_count).toBe(5);

    // After mark-all-read, the count drops to 0.
    await markAllReadForUser(global.testPrisma, 'u_basic', channelId);
    result = await getSubscribedChannelsWithUnread(global.testPrisma, 'u_basic');
    expect(result[0].read_at).not.toBeNull();
    expect(result[0].unread_count).toBe(0);
  });

  it('returns 0 unread for a channel with no videos', async () => {
    await global.testPrisma.user.create({
      data: { source_id: 'u_none', email: 'u_none@example.com', name: 'None' },
    });
    const channel = await global.testPrisma.channel.create({
      data: {
        source_id: 'ch_none',
        name: 'Empty Channel',
        rss_url: 'https://example.com/none.xml',
      },
    });
    await global.testPrisma.userSubscription.create({
      data: { user_id: 'u_none', channel_id: channel.id },
    });

    const result = await getSubscribedChannelsWithUnread(global.testPrisma, 'u_none');
    expect(result.length).toBe(1);
    expect(result[0].channel_id).toBe(channel.id);
    expect(result[0].unread_count).toBe(0);
  });

  it('returns multiple subscriptions in alphabetical order, each with its own count', async () => {
    await global.testPrisma.user.create({
      data: { source_id: 'u_multi', email: 'u_multi@example.com', name: 'Multi' },
    });

    // Three channels with different unread counts. Names chosen so the
    // alphabetical sort order is Beta, Charlie, Zebra.
    const baseMs = new Date('2026-01-01T00:00:00Z').getTime();
    const oneHourMs = 60 * 60 * 1000;
    const setupChannel = async (sourceId: string, name: string, videoCount: number) => {
      const channel = await global.testPrisma.channel.create({
        data: { source_id: sourceId, name, rss_url: `https://example.com/${sourceId}.xml` },
      });
      for (let i = 0; i < videoCount; i++) {
        await global.testPrisma.video.create({
          data: {
            channel_id: channel.id,
            source_id: `${sourceId}_video_${i}`,
            title: `${name} ${i}`,
            published_at: new Date(baseMs - i * oneHourMs),
          },
        });
      }
      await global.testPrisma.userSubscription.create({
        data: { user_id: 'u_multi', channel_id: channel.id },
      });
      return channel;
    };

    await setupChannel('ch_zebra', 'Zebra', 3);
    await setupChannel('ch_beta', 'Beta', 5);
    await setupChannel('ch_charlie', 'Charlie', 0);

    const result = await getSubscribedChannelsWithUnread(global.testPrisma, 'u_multi');
    expect(result.map((r) => r.name)).toEqual(['Beta', 'Charlie', 'Zebra']);
    expect(result.map((r) => r.unread_count)).toEqual([5, 0, 3]);
  });

  it('subtracts UserVideoConsumption rows from the unread count', async () => {
    const { channelId } = await setupChannelWithVideos({
      userSourceId: 'u_consume2',
      channelSourceId: 'ch_consume2',
      videoCount: 5,
    });

    const videos = await global.testPrisma.video.findMany({
      where: { channel_id: channelId },
      orderBy: { published_at: 'desc' },
      take: 2,
    });
    // Mark the two most recent as consumed.
    await global.testPrisma.userVideoConsumption.createMany({
      data: videos.map((v) => ({ user_id: 'u_consume2', video_id: v.id })),
    });

    const result = await getSubscribedChannelsWithUnread(global.testPrisma, 'u_consume2');
    expect(result[0].unread_count).toBe(3);
  });

  it('combines watermark and consumption: a video covered by either is read', async () => {
    const { channelId } = await setupChannelWithVideos({
      userSourceId: 'u_combo',
      channelSourceId: 'ch_combo',
      videoCount: 5,
    });

    // Set the watermark to the 3rd-most-recent video's published_at.
    // That covers videos 2, 3, 4 (0-indexed) → only videos 0, 1 remain unread.
    const cutoffVideo = await global.testPrisma.video.findFirstOrThrow({
      where: { channel_id: channelId },
      orderBy: { published_at: 'desc' },
      skip: 2,
      take: 1,
    });
    await global.testPrisma.userSubscription.update({
      where: {
        subscription_unique_user_channel: { user_id: 'u_combo', channel_id: channelId },
      },
      data: { read_at: cutoffVideo.published_at },
    });

    let result = await getSubscribedChannelsWithUnread(global.testPrisma, 'u_combo');
    expect(result[0].unread_count).toBe(2);

    // Now also mark the most recent (video 0) as consumed.
    const newest = await global.testPrisma.video.findFirstOrThrow({
      where: { channel_id: channelId },
      orderBy: { published_at: 'desc' },
    });
    await global.testPrisma.userVideoConsumption.create({
      data: { user_id: 'u_combo', video_id: newest.id },
    });

    result = await getSubscribedChannelsWithUnread(global.testPrisma, 'u_combo');
    expect(result[0].unread_count).toBe(1);
  });

  it('does not return rows for other users', async () => {
    // User A has a subscribed channel; user B does not.
    await setupChannelWithVideos({
      userSourceId: 'u_a_iso',
      channelSourceId: 'ch_a_iso',
      videoCount: 4,
    });
    await global.testPrisma.user.create({
      data: { source_id: 'u_b_iso', email: 'u_b_iso@example.com', name: 'B' },
    });

    const aResult = await getSubscribedChannelsWithUnread(global.testPrisma, 'u_a_iso');
    expect(aResult.length).toBe(1);
    expect(aResult[0].unread_count).toBe(4);

    const bResult = await getSubscribedChannelsWithUnread(global.testPrisma, 'u_b_iso');
    expect(bResult).toEqual([]);
  });
});
