import { ArticleStyle, GenerationStatus } from '@readtube/database';
import '@tests/integration-tests';

import { CONSUMPTION_WINDOW_DAYS } from '@/lib/channels/consumption';
import { getSubscribedChannelsWithUnread } from '@/lib/subscriptions';

const USER_ID = 'u_consumption';
const NOW = new Date('2026-06-15T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

/** `days` days before the pinned NOW. */
function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

async function setupSubscription(opts: {
  channelSourceId: string;
  subscribedDaysAgo: number;
  readAt?: Date | null;
}) {
  const channel = await global.testPrisma.channel.create({
    data: {
      source_id: opts.channelSourceId,
      name: `Channel ${opts.channelSourceId}`,
      rss_url: `https://example.com/${opts.channelSourceId}.xml`,
    },
  });
  await global.testPrisma.userSubscription.create({
    data: {
      user_id: USER_ID,
      channel_id: channel.id,
      created_at: daysAgo(opts.subscribedDaysAgo),
      read_at: opts.readAt ?? null,
    },
  });
  return channel.id;
}

/**
 * Create one video and, optionally, the read state + generated artifact
 * that together make it count as consumed.
 */
async function addVideo(opts: {
  channelId: string;
  sourceId: string;
  publishedDaysAgo: number | null;
  createdDaysAgo?: number;
  read?: boolean;
  artifact?: 'summary' | 'article' | 'generating-summary' | null;
}) {
  const video = await global.testPrisma.video.create({
    data: {
      channel_id: opts.channelId,
      source_id: opts.sourceId,
      title: `Video ${opts.sourceId}`,
      published_at: opts.publishedDaysAgo == null ? null : daysAgo(opts.publishedDaysAgo),
      created_at: daysAgo(opts.createdDaysAgo ?? opts.publishedDaysAgo ?? 0),
    },
  });

  if (opts.read === true) {
    await global.testPrisma.userVideoConsumption.create({
      data: { user_id: USER_ID, video_id: video.id },
    });
  }

  if (opts.artifact != null) {
    const transcript = await global.testPrisma.transcript.create({
      data: { video_id: video.id, text: 'transcript text', fetched_at: NOW },
    });
    if (opts.artifact === 'article') {
      await global.testPrisma.article.create({
        data: {
          transcript_id: transcript.id,
          style: ArticleStyle.NARRATIVE,
          prompt_version: 'v1',
          model: 'test-model',
          content: 'article body',
        },
      });
    } else {
      await global.testPrisma.summary.create({
        data: {
          transcript_id: transcript.id,
          prompt_version: 'v1',
          model: 'test-model',
          short: 'summary body',
          status:
            opts.artifact === 'generating-summary'
              ? GenerationStatus.GENERATING
              : GenerationStatus.READY,
        },
      });
    }
  }

  return video.id;
}

async function consumptionFor(channelId: string) {
  const rows = await getSubscribedChannelsWithUnread(global.testPrisma, USER_ID, NOW);
  const row = rows.find((r) => r.channel_id === channelId);
  if (row == null) {
    throw new Error(`No row for channel ${channelId}`);
  }
  return {
    total: row.consumption_total,
    consumed: row.consumption_consumed,
    sinceSubscribed: row.consumption_since_subscribed,
  };
}

beforeEach(async () => {
  await global.testPrisma.userVideoConsumption.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();

  await global.testPrisma.user.create({
    data: { source_id: USER_ID, email: `${USER_ID}@example.com`, name: 'Consumption' },
  });
});

describe('consumption counts', () => {
  it('counts a video as consumed only when it is both read and has generated content', async () => {
    const channelId = await setupSubscription({
      channelSourceId: 'ch_basic',
      subscribedDaysAgo: 365,
    });
    await addVideo({
      channelId,
      sourceId: 'v_read_with_summary',
      publishedDaysAgo: 5,
      read: true,
      artifact: 'summary',
    });
    await addVideo({
      channelId,
      sourceId: 'v_read_no_artifact',
      publishedDaysAgo: 6,
      read: true,
      artifact: null,
    });
    await addVideo({
      channelId,
      sourceId: 'v_unread_with_summary',
      publishedDaysAgo: 7,
      read: false,
      artifact: 'summary',
    });
    await addVideo({
      channelId,
      sourceId: 'v_untouched',
      publishedDaysAgo: 8,
      read: false,
      artifact: null,
    });

    expect(await consumptionFor(channelId)).toEqual({
      total: 4,
      consumed: 1,
      sinceSubscribed: false,
    });
  });

  it.each([
    ['a READY article', 'article' as const, 1],
    ['a READY summary', 'summary' as const, 1],
    ['an in-flight summary', 'generating-summary' as const, 0],
  ])('counts a read video with %s as %i consumed', async (_label, artifact, expected) => {
    const channelId = await setupSubscription({
      channelSourceId: `ch_${artifact}`,
      subscribedDaysAgo: 365,
    });
    await addVideo({
      channelId,
      sourceId: `v_${artifact}`,
      publishedDaysAgo: 3,
      read: true,
      artifact,
    });

    expect(await consumptionFor(channelId)).toEqual({
      total: 1,
      consumed: expected,
      sinceSubscribed: false,
    });
  });

  it('treats a watermark-covered video as read even without a consumption row', async () => {
    const channelId = await setupSubscription({
      channelSourceId: 'ch_watermark',
      subscribedDaysAgo: 365,
      readAt: daysAgo(4),
    });
    await addVideo({
      channelId,
      sourceId: 'v_below_watermark',
      publishedDaysAgo: 5,
      artifact: 'summary',
    });
    await addVideo({
      channelId,
      sourceId: 'v_above_watermark',
      publishedDaysAgo: 3,
      artifact: 'summary',
    });

    expect(await consumptionFor(channelId)).toEqual({
      total: 2,
      consumed: 1,
      sinceSubscribed: false,
    });
  });

  it('falls back to created_at for videos with no published_at', async () => {
    const channelId = await setupSubscription({
      channelSourceId: 'ch_null_date',
      subscribedDaysAgo: 365,
    });
    await addVideo({
      channelId,
      sourceId: 'v_null_in_window',
      publishedDaysAgo: null,
      createdDaysAgo: 10,
      read: true,
      artifact: 'summary',
    });
    await addVideo({
      channelId,
      sourceId: 'v_null_out_of_window',
      publishedDaysAgo: null,
      createdDaysAgo: CONSUMPTION_WINDOW_DAYS + 10,
      read: true,
      artifact: 'summary',
    });

    expect(await consumptionFor(channelId)).toEqual({
      total: 1,
      consumed: 1,
      sinceSubscribed: false,
    });
  });
});

describe('consumption window bounds', () => {
  it('ignores videos published before the trailing window', async () => {
    const channelId = await setupSubscription({
      channelSourceId: 'ch_window',
      subscribedDaysAgo: 365,
    });
    await addVideo({ channelId, sourceId: 'v_inside', publishedDaysAgo: 1 });
    await addVideo({
      channelId,
      sourceId: 'v_edge',
      publishedDaysAgo: CONSUMPTION_WINDOW_DAYS - 1,
    });
    await addVideo({
      channelId,
      sourceId: 'v_outside',
      publishedDaysAgo: CONSUMPTION_WINDOW_DAYS + 1,
    });

    expect(await consumptionFor(channelId)).toEqual({
      total: 2,
      consumed: 0,
      sinceSubscribed: false,
    });
  });

  it('floors the window at the subscribe date and flags it in the payload', async () => {
    const channelId = await setupSubscription({
      channelSourceId: 'ch_young',
      subscribedDaysAgo: 10,
    });
    await addVideo({
      channelId,
      sourceId: 'v_after_subscribe',
      publishedDaysAgo: 5,
      read: true,
      artifact: 'summary',
    });
    await addVideo({
      channelId,
      sourceId: 'v_before_subscribe',
      publishedDaysAgo: 30,
      read: true,
      artifact: 'summary',
    });

    expect(await consumptionFor(channelId)).toEqual({
      total: 1,
      consumed: 1,
      sinceSubscribed: true,
    });
  });

  it('reports an empty window for a channel with no videos', async () => {
    const channelId = await setupSubscription({
      channelSourceId: 'ch_empty',
      subscribedDaysAgo: 200,
    });

    expect(await consumptionFor(channelId)).toEqual({
      total: 0,
      consumed: 0,
      sinceSubscribed: false,
    });
  });

  it('scopes counts per channel and leaves the unread count untouched', async () => {
    const heavyId = await setupSubscription({
      channelSourceId: 'ch_heavy',
      subscribedDaysAgo: 200,
    });
    const lightId = await setupSubscription({
      channelSourceId: 'ch_light',
      subscribedDaysAgo: 200,
    });
    for (let i = 0; i < 3; i++) {
      await addVideo({
        channelId: heavyId,
        sourceId: `v_heavy_${i}`,
        publishedDaysAgo: i + 1,
        read: true,
        artifact: 'summary',
      });
      await addVideo({ channelId: lightId, sourceId: `v_light_${i}`, publishedDaysAgo: i + 1 });
    }

    const rows = await getSubscribedChannelsWithUnread(global.testPrisma, USER_ID, NOW);
    const heavy = rows.find((r) => r.channel_id === heavyId);
    const light = rows.find((r) => r.channel_id === lightId);

    expect(heavy?.consumption_consumed).toBe(3);
    expect(heavy?.consumption_total).toBe(3);
    expect(heavy?.unread_count).toBe(0);
    expect(light?.consumption_consumed).toBe(0);
    expect(light?.consumption_total).toBe(3);
    expect(light?.unread_count).toBe(3);
  });
});
