import { ChannelStatus, VideoPlatformType } from '@readtube/database';
import '@tests/integration-tests';

import type { RssChannel } from '@/lib/platforms/youtube/channelRss';
import type { ScrapedChannel } from '@/lib/platforms/youtube/channelScrape';
// ─── Imports (after mocks) ───────────────────────────────────────
import {
  FETCH_FAILED_PREFIX,
  INVALID_URL_PREFIX,
  fetchAndPersistChannelStep,
} from '@/lib/workflows/add-channel/steps';

// ─── Module mocks (hoisted by Jest) ──────────────────────────────

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

jest.mock('@/lib/platforms/youtube/channelRss', () => ({
  ...jest.requireActual('@/lib/platforms/youtube/channelRss'),
  fetchRssFeed: (url: string) => mockFetchRssFeed(url),
}));

const mockScrapeChannel = jest.fn<Promise<ScrapedChannel>, [string]>();

jest.mock('@/lib/platforms/youtube/channelScrape', () => ({
  ...jest.requireActual('@/lib/platforms/youtube/channelScrape'),
  scrapeChannel: (url: string) => mockScrapeChannel(url),
}));

const mockFetchChannelLatest = jest.fn();

jest.mock('@/lib/platforms/youtube/transcriptApi', () => ({
  ...jest.requireActual('@/lib/platforms/youtube/transcriptApi'),
  fetchChannelLatest: (input: string) => mockFetchChannelLatest(input),
}));

const mockFetchBilibiliChannelSnapshot = jest.fn();

jest.mock('@/lib/platforms/bilibili/channelSnapshot', () => ({
  ...jest.requireActual('@/lib/platforms/bilibili/channelSnapshot'),
  fetchBilibiliChannelSnapshot: (mid: string) => mockFetchBilibiliChannelSnapshot(mid),
}));

// The 'workflow' package is ESM-only; Jest's CJS loader can't parse
// its `export` syntax. Provide just the surface this step uses —
// FatalError. The class is a plain Error subclass so message-prefix
// matching in the route still works under test.
jest.mock('workflow', () => ({
  FatalError: class FatalError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'FatalError';
    }
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────

function makeRssFeed(
  channelId: string,
  channelName: string,
  videos: Array<{ videoId: string; title: string; published: string; description: string }>
): RssChannel {
  return {
    channelId,
    name: channelName,
    authorName: channelName,
    videos: videos.map((v) => ({
      videoId: v.videoId,
      title: v.title,
      description: v.description,
      publishedAt: new Date(v.published),
      thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      link: `https://www.youtube.com/watch?v=${v.videoId}`,
      channelId,
      channelName,
    })),
  };
}

// ─── Setup / Teardown ────────────────────────────────────────────

beforeEach(async () => {
  mockFetchRssFeed.mockReset();
  mockScrapeChannel.mockReset();
  mockFetchChannelLatest.mockReset();
  mockFetchBilibiliChannelSnapshot.mockReset();
  mockFetchChannelLatest.mockRejectedValue(new Error('TRANSCRIPT_API_KEY is not set'));
  mockScrapeChannel.mockResolvedValue({
    channelId: 'UC_default',
    name: 'Default',
    logoUrl: null,
    handle: null,
    videos: [],
    upcomingVideoIds: [],
  });
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
});

// ─── Tests ───────────────────────────────────────────────────────

describe('fetchAndPersistChannelStep', () => {
  it('creates a YouTube channel from a /channel/UC URL', async () => {
    mockScrapeChannel.mockResolvedValueOnce({
      channelId: 'UCnewchannelidexample22',
      name: 'New YouTube Channel',
      logoUrl: 'https://yt3.ggpht.com/logo.jpg',
      handle: '@newchannel',
      videos: [],
      upcomingVideoIds: [],
    });
    mockFetchRssFeed.mockResolvedValueOnce(
      makeRssFeed('UCnewchannelidexample22', 'New YouTube Channel', [
        {
          videoId: 'v1',
          title: 'Video 1',
          published: '2026-04-01T00:00:00Z',
          description: 'desc 1',
        },
        {
          videoId: 'v2',
          title: 'Video 2',
          published: '2026-04-02T00:00:00Z',
          description: 'desc 2',
        },
      ])
    );

    const result = await fetchAndPersistChannelStep(
      'https://www.youtube.com/channel/UCnewchannelidexample22'
    );

    expect(result.sourceId).toBe('UCnewchannelidexample22');
    expect(result.sourceType).toBe(VideoPlatformType.YOUTUBE);

    const row = await global.testPrisma.channel.findUniqueOrThrow({
      where: { id: result.channelId },
    });
    expect(row.name).toBe('New YouTube Channel');
    expect(row.handle).toBe('@newchannel');
    expect(row.logo_url).toBe('https://yt3.ggpht.com/logo.jpg');
    // Add path doesn't touch refresh-status columns — they keep their
    // schema-default values.
    expect(row.status).toBe(ChannelStatus.READY);
    expect(row.workflow_id).toBeNull();

    const videos = await global.testPrisma.video.findMany({
      where: { channel_id: result.channelId },
      orderBy: { source_id: 'asc' },
    });
    expect(videos).toHaveLength(2);
    expect(videos.map((v) => v.source_id)).toEqual(['v1', 'v2']);
  });

  it('creates a YouTube channel from an @handle URL by scraping first', async () => {
    mockScrapeChannel.mockResolvedValueOnce({
      channelId: 'UChandlechannelid12345',
      name: 'Handle Channel',
      logoUrl: null,
      handle: '@somehandle',
      videos: [],
      upcomingVideoIds: [],
    });
    mockFetchRssFeed.mockResolvedValueOnce(
      makeRssFeed('UChandlechannelid12345', 'Handle Channel', [
        {
          videoId: 'h1',
          title: 'H Video',
          published: '2026-04-10T00:00:00Z',
          description: 'h desc',
        },
      ])
    );

    const result = await fetchAndPersistChannelStep('https://www.youtube.com/@somehandle');

    expect(result.sourceId).toBe('UChandlechannelid12345');
    expect(result.sourceType).toBe(VideoPlatformType.YOUTUBE);
    // Confirms the handle path went through the scrape — the URL it's
    // called with is the channel-page URL, not the channel-id one.
    expect(mockScrapeChannel).toHaveBeenCalledWith('https://www.youtube.com/@somehandle');
  });

  it('creates a Bilibili channel from a space URL', async () => {
    mockFetchBilibiliChannelSnapshot.mockResolvedValueOnce({
      channelId: '12345',
      name: 'Bili Up',
      handle: null,
      logoUrl: 'https://i0.hdslb.com/avatar.jpg',
      videos: [
        {
          videoId: 'BV1abcdefghij',
          title: 'B Video',
          description: 'b desc',
          publishedAt: new Date('2026-04-15T00:00:00Z'),
          link: 'https://www.bilibili.com/video/BV1abcdefghij',
          thumbnailUrl: 'https://i0.hdslb.com/thumb.jpg',
          durationSeconds: 600,
        },
      ],
    });

    const result = await fetchAndPersistChannelStep('https://space.bilibili.com/12345');

    expect(result.sourceType).toBe(VideoPlatformType.BILIBILI);
    expect(result.sourceId).toBe('12345');

    const row = await global.testPrisma.channel.findUniqueOrThrow({
      where: { id: result.channelId },
    });
    expect(row.name).toBe('Bili Up');
    expect(row.rss_url).toBeNull();
  });

  it.each([
    ['empty input', ''],
    ['unrecognizable URL', 'https://example.com/not-a-channel'],
    ['plain text', 'just some words'],
  ])('throws INVALID_URL for %s', async (_label, input) => {
    await expect(fetchAndPersistChannelStep(input)).rejects.toThrow(INVALID_URL_PREFIX);
  });

  it('throws FETCH_FAILED when the upstream fetch errors', async () => {
    mockFetchBilibiliChannelSnapshot.mockRejectedValueOnce(new Error('JustOneAPI 503'));

    await expect(fetchAndPersistChannelStep('https://space.bilibili.com/9999')).rejects.toThrow(
      FETCH_FAILED_PREFIX
    );
  });

  it('is idempotent across reruns against the same channel', async () => {
    mockScrapeChannel.mockResolvedValue({
      channelId: 'UCidemidemchannel12345',
      name: 'Idempotent',
      logoUrl: null,
      handle: null,
      videos: [],
      upcomingVideoIds: [],
    });
    mockFetchRssFeed.mockResolvedValue(
      makeRssFeed('UCidemidemchannel12345', 'Idempotent', [
        {
          videoId: 'i1',
          title: 'I Video',
          published: '2026-04-20T00:00:00Z',
          description: 'i desc',
        },
      ])
    );

    const first = await fetchAndPersistChannelStep(
      'https://www.youtube.com/channel/UCidemidemchannel12345'
    );
    const second = await fetchAndPersistChannelStep(
      'https://www.youtube.com/channel/UCidemidemchannel12345'
    );

    expect(first.channelId).toBe(second.channelId);
    const channels = await global.testPrisma.channel.findMany({
      where: { source_type: VideoPlatformType.YOUTUBE, source_id: 'UCidemidemchannel12345' },
    });
    expect(channels).toHaveLength(1);
    const videos = await global.testPrisma.video.findMany({
      where: { channel_id: first.channelId },
    });
    expect(videos).toHaveLength(1);
  });
});
