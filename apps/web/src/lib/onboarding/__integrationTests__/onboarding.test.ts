import { GenerationStatus } from '@readtube/database';
import '@tests/integration-tests';

import { applyOnboardingSelection } from '@/lib/onboarding/apply';
import {
  MAX_VIDEOS_PER_CHANNEL,
  isNewUser,
  loadOnboardingSuggestions,
} from '@/lib/onboarding/suggestions';

// franc is ESM-only; language here comes from transcript rows, and the
// text fallback is covered by the unit tests.
jest.mock('@/lib/language/detect', () => ({ detectLanguage: jest.fn(() => null) }));

const NEW_USER = 'u_onboarding_new';
const OTHER_USER = 'u_onboarding_other';
const NOW = new Date('2026-06-15T12:00:00Z');
const HOUR_MS = 60 * 60 * 1000;

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR_MS);
}

async function createUser(sourceId: string) {
  await global.testPrisma.user.create({
    data: { source_id: sourceId, email: `${sourceId}@example.com`, name: sourceId },
  });
}

async function createChannel(
  sourceId: string,
  opts: { followed?: boolean; checked?: boolean; failed?: boolean } = {}
) {
  const channel = await global.testPrisma.channel.create({
    data: {
      source_id: sourceId,
      name: `Channel ${sourceId}`,
      rss_url: `https://example.com/${sourceId}.xml`,
      checked_at: opts.checked === false ? null : NOW,
      refresh_failed_at: opts.failed === true ? NOW : null,
    },
  });
  if (opts.followed !== false) {
    await global.testPrisma.userSubscription.create({
      data: { user_id: OTHER_USER, channel_id: channel.id },
    });
  }
  return channel.id;
}

async function createVideo(
  channelId: string,
  sourceId: string,
  opts: {
    publishedHoursAgo: number;
    transcriptLanguage?: string | null;
    summary?: GenerationStatus | null;
    thumbnail?: boolean;
  }
) {
  const video = await global.testPrisma.video.create({
    data: {
      channel_id: channelId,
      source_id: sourceId,
      title: `Video ${sourceId}`,
      published_at: hoursAgo(opts.publishedHoursAgo),
      thumbnail_url: opts.thumbnail === false ? null : `https://example.com/${sourceId}.jpg`,
    },
  });
  if (opts.transcriptLanguage !== undefined || opts.summary != null) {
    const transcript = await global.testPrisma.transcript.create({
      data: {
        video_id: video.id,
        text: 'transcript text',
        language: opts.transcriptLanguage ?? null,
        fetched_at: NOW,
      },
    });
    if (opts.summary != null) {
      await global.testPrisma.summary.create({
        data: {
          transcript_id: transcript.id,
          status: opts.summary,
          headline: `Headline ${sourceId}`,
          prompt_version: 'v1',
          model: 'test',
        },
      });
    }
  }
  return video.id;
}

beforeEach(async () => {
  await global.testPrisma.summary.deleteMany();
  await global.testPrisma.transcript.deleteMany();
  await global.testPrisma.userVideoConsumption.deleteMany();
  await global.testPrisma.standaloneVideo.deleteMany();
  await global.testPrisma.playlistVideo.deleteMany();
  await global.testPrisma.playlist.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
  await createUser(NEW_USER);
  await createUser(OTHER_USER);
});

describe('isNewUser', () => {
  it('is true for a user with nothing added', async () => {
    expect(await isNewUser(global.testPrisma, NEW_USER)).toBe(true);
  });

  it.each([
    {
      name: 'a subscription',
      add: async (channelId: string) => {
        await global.testPrisma.userSubscription.create({
          data: { user_id: NEW_USER, channel_id: channelId },
        });
      },
    },
    {
      name: 'a standalone video',
      add: async (channelId: string) => {
        const videoId = await createVideo(channelId, 'nu_v', { publishedHoursAgo: 1 });
        await global.testPrisma.standaloneVideo.create({
          data: { user_id: NEW_USER, video_id: videoId },
        });
      },
    },
    {
      name: 'a playlist',
      add: async () => {
        await global.testPrisma.playlist.create({
          data: { user_id: NEW_USER, source_id: 'nu_pl', name: 'Playlist' },
        });
      },
    },
  ])('is false once the user has $name', async ({ add }) => {
    const channelId = await createChannel('nu_ch');
    await add(channelId);
    expect(await isNewUser(global.testPrisma, NEW_USER)).toBe(false);
  });
});

describe('loadOnboardingSuggestions', () => {
  it('offers followed, hydrated, healthy channels, newest video first', async () => {
    const older = await createChannel('ch_older');
    await createVideo(older, 'older_v', { publishedHoursAgo: 10, transcriptLanguage: 'en' });
    const newer = await createChannel('ch_newer');
    await createVideo(newer, 'newer_v1', { publishedHoursAgo: 1, transcriptLanguage: 'zh-Hans' });
    await createVideo(newer, 'newer_v2', { publishedHoursAgo: 2 });
    // A second follower on the newer channel.
    await global.testPrisma.userSubscription.create({
      data: { user_id: NEW_USER, channel_id: newer },
    });

    const shadow = await createChannel('ch_shadow', { followed: false });
    await createVideo(shadow, 'shadow_v', { publishedHoursAgo: 0 });
    const unhydrated = await createChannel('ch_unhydrated', { checked: false });
    await createVideo(unhydrated, 'unhydrated_v', { publishedHoursAgo: 0 });
    const failing = await createChannel('ch_failing', { failed: true });
    await createVideo(failing, 'failing_v', { publishedHoursAgo: 0 });
    await createChannel('ch_empty');

    const { channels } = await loadOnboardingSuggestions(global.testPrisma);

    expect(
      channels.map((c) => ({
        id: c.id,
        followers: c.followerCount,
        language: c.language,
        titles: c.recentVideoTitles,
      }))
    ).toEqual([
      {
        id: newer,
        followers: 2,
        language: 'zh',
        titles: ['Video newer_v1', 'Video newer_v2'],
      },
      { id: older, followers: 1, language: 'en', titles: ['Video older_v'] },
    ]);
  });

  it('offers only videos with ready content and a thumbnail, capped per channel', async () => {
    const busy = await createChannel('ch_busy');
    const busyIds: string[] = [];
    for (let i = 0; i < MAX_VIDEOS_PER_CHANNEL + 2; i++) {
      busyIds.push(
        await createVideo(busy, `busy_v${i}`, {
          publishedHoursAgo: i,
          transcriptLanguage: 'en',
          summary: GenerationStatus.READY,
        })
      );
    }
    const quiet = await createChannel('ch_quiet', { followed: false });
    const quietId = await createVideo(quiet, 'quiet_v', {
      publishedHoursAgo: 20,
      transcriptLanguage: 'ja',
      summary: GenerationStatus.READY,
    });
    await createVideo(quiet, 'generating_v', {
      publishedHoursAgo: 0,
      summary: GenerationStatus.GENERATING,
    });
    await createVideo(quiet, 'no_content_v', { publishedHoursAgo: 0, transcriptLanguage: 'en' });
    await createVideo(quiet, 'no_thumb_v', {
      publishedHoursAgo: 0,
      summary: GenerationStatus.READY,
      thumbnail: false,
    });

    const { videos } = await loadOnboardingSuggestions(global.testPrisma);

    expect(videos.map((v) => v.id)).toEqual([...busyIds.slice(0, MAX_VIDEOS_PER_CHANNEL), quietId]);
    expect(videos[videos.length - 1]).toMatchObject({
      language: 'ja',
      headline: 'Headline quiet_v',
      channelName: 'Channel ch_quiet',
    });
  });
});

describe('applyOnboardingSelection', () => {
  it('follows eligible channels and adds eligible videos, skipping the rest', async () => {
    const channelId = await createChannel('apply_ch');
    for (let i = 0; i < 8; i++) {
      await createVideo(channelId, `apply_ch_v${i}`, { publishedHoursAgo: i });
    }
    const shadowId = await createChannel('apply_shadow', { checked: false });
    const readyVideo = await createVideo(shadowId, 'apply_ready', {
      publishedHoursAgo: 1,
      summary: GenerationStatus.READY,
    });
    const bareVideo = await createVideo(shadowId, 'apply_bare', { publishedHoursAgo: 1 });

    const result = await applyOnboardingSelection(global.testPrisma, NEW_USER, {
      channelIds: [channelId, shadowId, 'missing'],
      videoIds: [readyVideo, bareVideo],
    });

    expect(result).toEqual({ followedChannels: 1, addedVideos: 1 });
    const subscriptions = await global.testPrisma.userSubscription.findMany({
      where: { user_id: NEW_USER },
    });
    expect(subscriptions.map((s) => s.channel_id)).toEqual([channelId]);
    // Same initial watermark as the Add dialog: only the newest few
    // videos start unread, so the inbox isn't a wall of backlog.
    expect(subscriptions[0].read_at).not.toBeNull();

    const standalone = await global.testPrisma.standaloneVideo.findMany({
      where: { user_id: NEW_USER },
    });
    expect(standalone.map((s) => s.video_id)).toEqual([readyVideo]);
    // Picked videos stay unread.
    expect(
      await global.testPrisma.userVideoConsumption.count({ where: { user_id: NEW_USER } })
    ).toBe(0);
    expect(await isNewUser(global.testPrisma, NEW_USER)).toBe(false);
  });

  it('is a no-op when applied again', async () => {
    const channelId = await createChannel('again_ch');
    await createVideo(channelId, 'again_v', { publishedHoursAgo: 1 });
    const videoId = await createVideo(channelId, 'again_ready', {
      publishedHoursAgo: 2,
      summary: GenerationStatus.READY,
    });
    const selection = { channelIds: [channelId], videoIds: [videoId] };

    await applyOnboardingSelection(global.testPrisma, NEW_USER, selection);
    const again = await applyOnboardingSelection(global.testPrisma, NEW_USER, selection);

    expect(again).toEqual({ followedChannels: 0, addedVideos: 0 });
    expect(await global.testPrisma.userSubscription.count({ where: { user_id: NEW_USER } })).toBe(
      1
    );
    expect(await global.testPrisma.standaloneVideo.count({ where: { user_id: NEW_USER } })).toBe(1);
  });
});
