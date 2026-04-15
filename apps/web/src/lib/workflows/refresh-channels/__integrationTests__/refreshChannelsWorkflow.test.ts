import '@tests/integration-tests';

import { refreshChannelsWorkflow } from '@/lib/workflows/refresh-channels';
import type { StaleChannel } from '@/lib/workflows/refresh-channels/steps';
// ─── Imports (after mocks) ───────────────────────────────────────
import {
  BATCH_SIZE,
  STALE_DAYS,
  fetchStaleChannels,
  refreshChannel,
} from '@/lib/workflows/refresh-channels/steps';
import type { RssChannel } from '@/lib/youtube/rss';
import type { ScrapedChannel } from '@/lib/youtube/scrapeChannel';

// ─── Module mocks (hoisted by Jest) ──────────────────────────────

/**
 * Replace @readtube/database's `prisma` singleton with a lazy proxy
 * that forwards every property access to global.testPrisma at call-time
 * (after the test-container setup has run).
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

const mockFetchRssFeed = jest.fn<Promise<RssChannel>, [string]>();

jest.mock('@/lib/youtube/rss', () => ({
  ...jest.requireActual('@/lib/youtube/rss'),
  fetchRssFeed: (url: string) => mockFetchRssFeed(url),
}));

const mockScrapeChannel = jest.fn<Promise<ScrapedChannel>, [string]>();

jest.mock('@/lib/youtube/scrapeChannel', () => ({
  ...jest.requireActual('@/lib/youtube/scrapeChannel'),
  scrapeChannel: (url: string) => mockScrapeChannel(url),
}));

// ─── Helpers ─────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function createChannel(opts: { sourceId: string; name: string; checkedAt?: Date | null }) {
  return global.testPrisma.channel.create({
    data: {
      source_id: opts.sourceId,
      name: opts.name,
      rss_url: `https://www.youtube.com/feeds/videos.xml?channel_id=${opts.sourceId}`,
      checked_at: opts.checkedAt ?? null,
    },
  });
}

function makeRssFeed(
  channelName: string,
  videos: Array<{
    videoId: string;
    title: string;
    published: string;
    description: string;
    isShort?: boolean;
  }>
): RssChannel {
  return {
    channelId: 'UC_test',
    name: channelName,
    videos: videos.map((v) => ({
      videoId: v.videoId,
      title: v.title,
      description: v.description,
      publishedAt: new Date(v.published),
      thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      link:
        v.isShort === true
          ? `https://www.youtube.com/shorts/${v.videoId}`
          : `https://www.youtube.com/watch?v=${v.videoId}`,
    })),
  };
}

// ─── Setup / Teardown ────────────────────────────────────────────

beforeEach(async () => {
  mockFetchRssFeed.mockReset();
  mockScrapeChannel.mockReset();
  // Default: scrape returns no extra data (logo/duration tests override this)
  mockScrapeChannel.mockResolvedValue({
    channelId: 'UC_default',
    name: 'Default',
    logoUrl: null,
    handle: null,
    videos: [],
  });
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
});

// ─── fetchStaleChannels ──────────────────────────────────────────

describe('fetchStaleChannels', () => {
  it('returns channels with null checked_at', async () => {
    const ch = await createChannel({ sourceId: 'UC_null', name: 'Null Channel' });

    const result = await fetchStaleChannels();

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(ch.id);
  });

  it('returns channels with checked_at older than STALE_DAYS', async () => {
    await createChannel({
      sourceId: 'UC_stale',
      name: 'Stale Channel',
      checkedAt: daysAgo(STALE_DAYS + 1),
    });

    const result = await fetchStaleChannels();

    expect(result).toHaveLength(1);
    expect(result[0]!.source_id).toBe('UC_stale');
  });

  it('excludes recently checked channels', async () => {
    await createChannel({
      sourceId: 'UC_fresh',
      name: 'Fresh Channel',
      checkedAt: daysAgo(STALE_DAYS - 1),
    });

    const result = await fetchStaleChannels();

    expect(result).toHaveLength(0);
  });

  it('orders by checked_at ascending with nulls first', async () => {
    await createChannel({
      sourceId: 'UC_old',
      name: 'Old',
      checkedAt: daysAgo(STALE_DAYS + 2),
    });
    await createChannel({ sourceId: 'UC_null', name: 'Never Checked' });
    await createChannel({
      sourceId: 'UC_older',
      name: 'Older',
      checkedAt: daysAgo(STALE_DAYS + 5),
    });

    const result = await fetchStaleChannels();

    // nulls: 'first' ensures never-checked channels are prioritized
    expect(result.map((c) => c.source_id)).toEqual(['UC_null', 'UC_older', 'UC_old']);
  });

  it(`limits results to BATCH_SIZE (${BATCH_SIZE})`, async () => {
    for (let i = 0; i < BATCH_SIZE + 3; i++) {
      await createChannel({ sourceId: `UC_batch_${i}`, name: `Ch ${i}` });
    }

    const result = await fetchStaleChannels();

    expect(result).toHaveLength(BATCH_SIZE);
  });
});

// ─── refreshChannel ──────────────────────────────────────────────

describe('refreshChannel', () => {
  it('upserts videos and updates checked_at', async () => {
    const ch = await createChannel({ sourceId: 'UC_refresh', name: 'My Channel' });
    mockFetchRssFeed.mockResolvedValueOnce(
      makeRssFeed('My Channel', [
        {
          videoId: 'vid_1',
          title: 'First Video',
          published: '2026-01-15T00:00:00Z',
          description: 'Desc 1',
        },
        {
          videoId: 'vid_2',
          title: 'Second Video',
          published: '2026-01-14T00:00:00Z',
          description: 'Desc 2',
        },
      ])
    );

    const staleChannel: StaleChannel = {
      id: ch.id,
      source_id: ch.source_id,
      name: ch.name,
      rss_url: ch.rss_url,
    };
    const result = await refreshChannel(staleChannel);

    expect(result.videosProcessed).toBe(2);
    expect(result.nameUpdated).toBe(false);

    const videos = await global.testPrisma.video.findMany({
      where: { channel_id: ch.id },
      orderBy: { source_id: 'asc' },
    });
    expect(videos).toHaveLength(2);
    expect(videos[0]!.source_id).toBe('vid_1');
    expect(videos[0]!.title).toBe('First Video');
    expect(videos[0]!.thumbnail_url).toBe('https://i.ytimg.com/vi/vid_1/hqdefault.jpg');
    expect(videos[1]!.source_id).toBe('vid_2');

    const updated = await global.testPrisma.channel.findUnique({ where: { id: ch.id } });
    expect(updated!.checked_at).not.toBeNull();
  });

  it('updates channel name when it changes', async () => {
    const ch = await createChannel({ sourceId: 'UC_rename', name: 'Old Name' });
    mockFetchRssFeed.mockResolvedValueOnce(makeRssFeed('New Name', []));

    const result = await refreshChannel({
      id: ch.id,
      source_id: ch.source_id,
      name: ch.name,
      rss_url: ch.rss_url,
    });

    expect(result.nameUpdated).toBe(true);

    const updated = await global.testPrisma.channel.findUnique({ where: { id: ch.id } });
    expect(updated!.name).toBe('New Name');
  });

  it('does not clobber existing description with empty string', async () => {
    const ch = await createChannel({ sourceId: 'UC_desc', name: 'Desc Ch' });
    await global.testPrisma.video.create({
      data: {
        channel_id: ch.id,
        source_id: 'vid_existing',
        title: 'Existing',
        description: 'Real description',
        published_at: new Date('2026-01-10T00:00:00Z'),
      },
    });

    mockFetchRssFeed.mockResolvedValueOnce(
      makeRssFeed('Desc Ch', [
        {
          videoId: 'vid_existing',
          title: 'Updated Title',
          published: '2026-01-10T00:00:00Z',
          description: '',
        },
      ])
    );

    await refreshChannel({
      id: ch.id,
      source_id: ch.source_id,
      name: ch.name,
      rss_url: ch.rss_url,
    });

    const video = await global.testPrisma.video.findFirst({
      where: { channel_id: ch.id, source_id: 'vid_existing' },
    });
    expect(video!.title).toBe('Updated Title');
    expect(video!.description).toBe('Real description');
  });

  it('creates new videos and updates existing ones in the same batch', async () => {
    const ch = await createChannel({ sourceId: 'UC_mix', name: 'Mix Ch' });
    await global.testPrisma.video.create({
      data: {
        channel_id: ch.id,
        source_id: 'vid_old',
        title: 'Old Title',
        description: 'Old desc',
        published_at: new Date('2026-01-01T00:00:00Z'),
      },
    });

    mockFetchRssFeed.mockResolvedValueOnce(
      makeRssFeed('Mix Ch', [
        {
          videoId: 'vid_old',
          title: 'New Title',
          published: '2026-01-01T00:00:00Z',
          description: 'New desc',
        },
        {
          videoId: 'vid_new',
          title: 'Brand New',
          published: '2026-01-20T00:00:00Z',
          description: 'Fresh',
        },
      ])
    );

    const result = await refreshChannel({
      id: ch.id,
      source_id: ch.source_id,
      name: ch.name,
      rss_url: ch.rss_url,
    });

    expect(result.videosProcessed).toBe(2);

    const videos = await global.testPrisma.video.findMany({
      where: { channel_id: ch.id },
      orderBy: { source_id: 'asc' },
    });
    expect(videos).toHaveLength(2);
    // source_id ASC: vid_new < vid_old
    expect(videos[0]!.source_id).toBe('vid_new');
    expect(videos[0]!.title).toBe('Brand New');
    expect(videos[1]!.source_id).toBe('vid_old');
    expect(videos[1]!.title).toBe('New Title');
    expect(videos[1]!.description).toBe('New desc');
  });

  it('persists logo_url from scrape and duration_seconds per video', async () => {
    const ch = await createChannel({ sourceId: 'UC_logo', name: 'Logo Ch' });
    mockFetchRssFeed.mockResolvedValueOnce(
      makeRssFeed('Logo Ch', [
        {
          videoId: 'vid_dur',
          title: 'With Duration',
          published: '2026-02-01T00:00:00Z',
          description: 'Test',
        },
      ])
    );
    mockScrapeChannel.mockResolvedValueOnce({
      channelId: 'UC_logo',
      name: 'Logo Ch',
      logoUrl: 'https://yt3.googleusercontent.com/logo.jpg',
      handle: null,
      videos: [
        {
          videoId: 'vid_dur',
          title: 'With Duration',
          description: '',
          publishedAt: new Date('2026-02-01T00:00:00Z'),
          durationSeconds: 754,
        },
      ],
    });

    await refreshChannel({
      id: ch.id,
      source_id: ch.source_id,
      name: ch.name,
      rss_url: ch.rss_url,
    });

    const updated = await global.testPrisma.channel.findUnique({ where: { id: ch.id } });
    expect(updated!.logo_url).toBe('https://yt3.googleusercontent.com/logo.jpg');

    const video = await global.testPrisma.video.findFirst({
      where: { channel_id: ch.id, source_id: 'vid_dur' },
    });
    expect(video!.duration_seconds).toBe(754);
  });

  it('still succeeds when scraping fails (best-effort)', async () => {
    const ch = await createChannel({ sourceId: 'UC_scrape_fail', name: 'Scrape Fail' });
    mockFetchRssFeed.mockResolvedValueOnce(
      makeRssFeed('Scrape Fail', [
        {
          videoId: 'vid_ok',
          title: 'Still Works',
          published: '2026-02-01T00:00:00Z',
          description: 'Yes',
        },
      ])
    );
    mockScrapeChannel.mockRejectedValueOnce(new Error('YouTube blocked'));

    const result = await refreshChannel({
      id: ch.id,
      source_id: ch.source_id,
      name: ch.name,
      rss_url: ch.rss_url,
    });

    expect(result.videosProcessed).toBe(1);

    const video = await global.testPrisma.video.findFirst({
      where: { channel_id: ch.id, source_id: 'vid_ok' },
    });
    expect(video!.title).toBe('Still Works');
    expect(video!.duration_seconds).toBeNull();

    const updated = await global.testPrisma.channel.findUnique({ where: { id: ch.id } });
    expect(updated!.checked_at).not.toBeNull();
    expect(updated!.logo_url).toBeNull();
  });

  it('does not overwrite logo_url when scrape returns null', async () => {
    const ch = await createChannel({ sourceId: 'UC_full', name: 'Full Ch' });
    // Pre-set logo_url on channel
    await global.testPrisma.channel.update({
      where: { id: ch.id },
      data: { logo_url: 'https://existing-logo.jpg' },
    });
    // Pre-create video with duration_seconds
    await global.testPrisma.video.create({
      data: {
        channel_id: ch.id,
        source_id: 'vid_has_dur',
        title: 'Old',
        published_at: new Date('2026-01-01T00:00:00Z'),
        duration_seconds: 120,
      },
    });

    mockFetchRssFeed.mockResolvedValueOnce(
      makeRssFeed('Full Ch', [
        {
          videoId: 'vid_has_dur',
          title: 'Updated',
          published: '2026-01-01T00:00:00Z',
          description: 'Desc',
        },
      ])
    );
    // Scrape returns null logo — should not overwrite existing
    mockScrapeChannel.mockResolvedValueOnce({
      channelId: 'UC_full',
      name: 'Full Ch',
      logoUrl: null,
      handle: null,
      videos: [],
    });

    await refreshChannel({
      id: ch.id,
      source_id: ch.source_id,
      name: ch.name,
      rss_url: ch.rss_url,
    });

    // Scrape is always called now (for logo freshness)
    expect(mockScrapeChannel).toHaveBeenCalled();

    // Existing logo_url preserved when scrape returns null
    const updated = await global.testPrisma.channel.findUnique({ where: { id: ch.id } });
    expect(updated!.logo_url).toBe('https://existing-logo.jpg');

    // duration_seconds should be preserved, not overwritten
    const video = await global.testPrisma.video.findFirst({
      where: { channel_id: ch.id, source_id: 'vid_has_dur' },
    });
    expect(video!.duration_seconds).toBe(120);
    expect(video!.title).toBe('Updated');
  });
});

describe('refreshChannel — Shorts filtering', () => {
  it('skips videos whose RSS link uses the /shorts/ path', async () => {
    const ch = await createChannel({ sourceId: 'UC_short', name: 'Short Ch' });
    mockFetchRssFeed.mockResolvedValueOnce(
      makeRssFeed('Short Ch', [
        {
          videoId: 'vid_short',
          title: 'A Short',
          published: '2026-03-01T00:00:00Z',
          description: '',
          isShort: true,
        },
        {
          videoId: 'vid_long',
          title: 'A Real Video',
          published: '2026-03-01T00:00:00Z',
          description: '',
        },
      ])
    );

    const result = await refreshChannel({
      id: ch.id,
      source_id: ch.source_id,
      name: ch.name,
      rss_url: ch.rss_url,
    });

    expect(result.videosProcessed).toBe(1);
    const stored = await global.testPrisma.video.findMany({ where: { channel_id: ch.id } });
    expect(stored.map((v) => v.source_id)).toEqual(['vid_long']);
  });

  it('ignores short-duration videos that are not marked as Shorts in the RSS link', async () => {
    // A regular video under 60 seconds (e.g. a teaser) should still be
    // stored — the duration threshold is not the filter signal.
    const ch = await createChannel({ sourceId: 'UC_teaser', name: 'Teaser Ch' });
    mockFetchRssFeed.mockResolvedValueOnce(
      makeRssFeed('Teaser Ch', [
        {
          videoId: 'vid_teaser',
          title: 'Short teaser, not a Short',
          published: '2026-03-01T00:00:00Z',
          description: '',
        },
      ])
    );
    mockScrapeChannel.mockResolvedValueOnce({
      channelId: 'UC_teaser',
      name: 'Teaser Ch',
      logoUrl: null,
      handle: null,
      videos: [
        {
          videoId: 'vid_teaser',
          title: 'Short teaser, not a Short',
          description: '',
          publishedAt: new Date('2026-03-01T00:00:00Z'),
          durationSeconds: 45,
        },
      ],
    });

    const result = await refreshChannel({
      id: ch.id,
      source_id: ch.source_id,
      name: ch.name,
      rss_url: ch.rss_url,
    });

    expect(result.videosProcessed).toBe(1);
    const stored = await global.testPrisma.video.findFirst({ where: { channel_id: ch.id } });
    expect(stored!.source_id).toBe('vid_teaser');
    expect(stored!.duration_seconds).toBe(45);
  });

  it('does not delete existing Shorts already in the database', async () => {
    // Filtering only blocks new ingest; previously-stored Shorts stay put.
    const ch = await createChannel({ sourceId: 'UC_existing_short', name: 'Existing' });
    await global.testPrisma.video.create({
      data: {
        channel_id: ch.id,
        source_id: 'vid_existing_short',
        title: 'Old Short',
        published_at: new Date('2026-01-01T00:00:00Z'),
        duration_seconds: 30,
      },
    });

    mockFetchRssFeed.mockResolvedValueOnce(
      makeRssFeed('Existing', [
        {
          videoId: 'vid_existing_short',
          title: 'Old Short Updated',
          published: '2026-01-01T00:00:00Z',
          description: 'Updated',
          isShort: true,
        },
      ])
    );

    const result = await refreshChannel({
      id: ch.id,
      source_id: ch.source_id,
      name: ch.name,
      rss_url: ch.rss_url,
    });

    // Filtered out of ingest — no upsert ran, stored row unchanged.
    expect(result.videosProcessed).toBe(0);
    const stored = await global.testPrisma.video.findFirst({
      where: { channel_id: ch.id, source_id: 'vid_existing_short' },
    });
    expect(stored!.title).toBe('Old Short');
  });
});

// ─── refreshChannelsWorkflow (end-to-end) ────────────────────────

describe('refreshChannelsWorkflow', () => {
  it('refreshes stale channels and skips fresh ones', async () => {
    const stale = await createChannel({ sourceId: 'UC_stale_wf', name: 'Stale' });
    await createChannel({
      sourceId: 'UC_fresh_wf',
      name: 'Fresh',
      checkedAt: new Date(),
    });

    mockFetchRssFeed.mockResolvedValueOnce(
      makeRssFeed('Stale', [
        {
          videoId: 'vid_wf_1',
          title: 'Workflow Video',
          published: '2026-02-01T00:00:00Z',
          description: 'From workflow',
        },
      ])
    );

    const result = await refreshChannelsWorkflow();

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.channelId).toBe(stale.id);
    expect(result.errors).toBe(0);

    // Fresh channel should not have been touched
    expect(mockFetchRssFeed).toHaveBeenCalledTimes(1);
    expect(mockFetchRssFeed).toHaveBeenCalledWith(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UC_stale_wf'
    );
  });

  it('continues processing remaining channels after one fails', async () => {
    // Use explicit checked_at values to guarantee deterministic ordering
    // (nulls first, then oldest) instead of relying on insertion order.
    const ch1 = await createChannel({ sourceId: 'UC_fail', name: 'Fail', checkedAt: null });
    const ch2 = await createChannel({
      sourceId: 'UC_ok',
      name: 'OK',
      checkedAt: daysAgo(STALE_DAYS + 1),
    });

    mockFetchRssFeed.mockRejectedValueOnce(new Error('API down')).mockResolvedValueOnce(
      makeRssFeed('OK', [
        {
          videoId: 'vid_ok',
          title: 'OK Video',
          published: '2026-03-01T00:00:00Z',
          description: '',
        },
      ])
    );

    const result = await refreshChannelsWorkflow();

    expect(result.errors).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.channelId).toBe(ch2.id);

    // Failed channel should not have checked_at updated
    const failedChannel = await global.testPrisma.channel.findUnique({
      where: { id: ch1.id },
    });
    expect(failedChannel!.checked_at).toBeNull();
  });
});
