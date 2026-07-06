/**
 * Orchestration-order tests for fetchChannelSnapshot: which sources
 * run, in what priority, and how failures cascade. The per-source
 * fetchers are module-mocked; the pure merge logic is covered in
 * channelSnapshot.test.ts.
 */
import type { ChannelSnapshot } from '@/lib/platforms/types';
import { fetchRssFeed } from '@/lib/platforms/youtube/channelRss';
import { scrapeChannel } from '@/lib/platforms/youtube/channelScrape';
import { fetchChannelSnapshot } from '@/lib/platforms/youtube/channelSnapshot';
import { fetchChannelViaDataApi, isDataApiConfigured } from '@/lib/platforms/youtube/dataApi';
import { fetchChannelLatest } from '@/lib/platforms/youtube/transcriptApi';

jest.mock('@/lib/platforms/youtube/dataApi', () => ({
  isDataApiConfigured: jest.fn(),
  fetchChannelViaDataApi: jest.fn(),
}));
jest.mock('@/lib/platforms/youtube/channelScrape', () => ({
  scrapeChannel: jest.fn(),
}));
jest.mock('@/lib/platforms/youtube/channelRss', () => ({
  ...jest.requireActual('@/lib/platforms/youtube/channelRss'),
  fetchRssFeed: jest.fn(),
}));
jest.mock('@/lib/platforms/youtube/transcriptApi', () => ({
  fetchChannelLatest: jest.fn(),
}));

const CHANNEL_ID = 'UCBJycsmduvYEL83R_U4JriQ';
const CHANNEL_PAGE_URL = `https://www.youtube.com/channel/${CHANNEL_ID}`;
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

function dataApiSnapshot(overrides?: Partial<ChannelSnapshot>): ChannelSnapshot {
  return {
    channelId: CHANNEL_ID,
    name: 'Data API Channel',
    handle: '@dataapi',
    logoUrl: 'https://yt3.googleusercontent.com/logo=s800',
    videos: [
      {
        videoId: 'dQw4w9WgXcQ',
        title: 'Data API Video',
        description: 'desc',
        publishedAt: new Date('2024-06-01T00:00:00Z'),
        link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        durationSeconds: 630,
      },
    ],
    ...overrides,
  };
}

function mockScrapeAndRssSuccess(): void {
  (scrapeChannel as jest.Mock).mockResolvedValue({
    channelId: CHANNEL_ID,
    name: 'Scraped Channel',
    logoUrl: 'https://logo.example/a.jpg',
    handle: '@scraped',
    videos: [],
    upcomingVideoIds: [],
    memberOnlyVideoIds: [],
  });
  (fetchRssFeed as jest.Mock).mockResolvedValue({
    channelId: CHANNEL_ID,
    name: 'RSS Channel',
    authorName: 'RSS Channel',
    videos: [
      {
        videoId: 'rssvideo123',
        title: 'RSS Video',
        description: 'rss desc',
        publishedAt: new Date('2024-06-02T00:00:00Z'),
        link: 'https://www.youtube.com/watch?v=rssvideo123',
        thumbnailUrl: null,
        channelId: CHANNEL_ID,
        channelName: 'RSS Channel',
      },
    ],
  });
}

describe('fetchChannelSnapshot orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the Data API snapshot without calling scrape, RSS, or TranscriptAPI', async () => {
    (isDataApiConfigured as jest.Mock).mockReturnValue(true);
    (fetchChannelViaDataApi as jest.Mock).mockResolvedValue(dataApiSnapshot());

    const snapshot = await fetchChannelSnapshot({
      channelPageUrl: CHANNEL_PAGE_URL,
      rssUrl: RSS_URL,
    });

    expect(snapshot.name).toBe('Data API Channel');
    expect(fetchChannelViaDataApi).toHaveBeenCalledWith({ channelId: CHANNEL_ID });
    expect(scrapeChannel).not.toHaveBeenCalled();
    expect(fetchRssFeed).not.toHaveBeenCalled();
    expect(fetchChannelLatest).not.toHaveBeenCalled();
  });

  it('passes an @handle URL to the Data API as forHandle input', async () => {
    (isDataApiConfigured as jest.Mock).mockReturnValue(true);
    (fetchChannelViaDataApi as jest.Mock).mockResolvedValue(dataApiSnapshot());

    await fetchChannelSnapshot({ channelPageUrl: 'https://www.youtube.com/@mkbhd' });

    expect(fetchChannelViaDataApi).toHaveBeenCalledWith({ handle: '@mkbhd' });
    expect(scrapeChannel).not.toHaveBeenCalled();
  });

  it('does not call the Data API when YOUTUBE_API_KEY is not configured', async () => {
    (isDataApiConfigured as jest.Mock).mockReturnValue(false);
    mockScrapeAndRssSuccess();

    const snapshot = await fetchChannelSnapshot({
      channelPageUrl: CHANNEL_PAGE_URL,
      rssUrl: RSS_URL,
    });

    expect(fetchChannelViaDataApi).not.toHaveBeenCalled();
    expect(snapshot.name).toBe('RSS Channel');
    expect(snapshot.handle).toBe('@scraped');
  });

  it('falls back to scrape + RSS when the Data API throws', async () => {
    (isDataApiConfigured as jest.Mock).mockReturnValue(true);
    (fetchChannelViaDataApi as jest.Mock).mockRejectedValue(new Error('quotaExceeded'));
    mockScrapeAndRssSuccess();

    const snapshot = await fetchChannelSnapshot({
      channelPageUrl: CHANNEL_PAGE_URL,
      rssUrl: RSS_URL,
    });

    expect(snapshot.name).toBe('RSS Channel');
    expect(snapshot.videos.map((v) => v.videoId)).toEqual(['rssvideo123']);
  });

  it('falls back to scrape + RSS when the Data API returns zero videos', async () => {
    (isDataApiConfigured as jest.Mock).mockReturnValue(true);
    (fetchChannelViaDataApi as jest.Mock).mockResolvedValue(dataApiSnapshot({ videos: [] }));
    mockScrapeAndRssSuccess();

    const snapshot = await fetchChannelSnapshot({
      channelPageUrl: CHANNEL_PAGE_URL,
      rssUrl: RSS_URL,
    });

    expect(snapshot.name).toBe('RSS Channel');
  });

  it('skips the Data API for URLs with neither a UC id nor an @handle', async () => {
    (isDataApiConfigured as jest.Mock).mockReturnValue(true);
    mockScrapeAndRssSuccess();

    await fetchChannelSnapshot({
      channelPageUrl: 'https://www.youtube.com/user/legacyname',
      rssUrl: RSS_URL,
    });

    expect(fetchChannelViaDataApi).not.toHaveBeenCalled();
    expect(scrapeChannel).toHaveBeenCalled();
  });

  describe('fetched_via source tagging', () => {
    it('tags the Data API tier as data_api', async () => {
      (isDataApiConfigured as jest.Mock).mockReturnValue(true);
      (fetchChannelViaDataApi as jest.Mock).mockResolvedValue(dataApiSnapshot());

      const snapshot = await fetchChannelSnapshot({
        channelPageUrl: CHANNEL_PAGE_URL,
        rssUrl: RSS_URL,
      });

      expect(snapshot.fetchedVia).toBe('data_api');
    });

    it('tags the RSS tier as rss', async () => {
      (isDataApiConfigured as jest.Mock).mockReturnValue(false);
      mockScrapeAndRssSuccess();

      const snapshot = await fetchChannelSnapshot({
        channelPageUrl: CHANNEL_PAGE_URL,
        rssUrl: RSS_URL,
      });

      expect(snapshot.fetchedVia).toBe('rss');
    });

    it('tags the TranscriptAPI fallback as transcript_api when RSS fails', async () => {
      (isDataApiConfigured as jest.Mock).mockReturnValue(false);
      (scrapeChannel as jest.Mock).mockResolvedValue({
        channelId: CHANNEL_ID,
        name: 'Scraped Channel',
        logoUrl: null,
        handle: '@scraped',
        videos: [],
        upcomingVideoIds: [],
        memberOnlyVideoIds: [],
      });
      (fetchRssFeed as jest.Mock).mockRejectedValue(new Error('RSS 404'));
      (fetchChannelLatest as jest.Mock).mockResolvedValue({
        channel: { channelId: CHANNEL_ID, title: 'TApi Channel' },
        videos: [
          {
            videoId: 'tapivideo01',
            title: 'TApi Video',
            description: 'd',
            publishedAt: new Date('2024-06-02T00:00:00Z'),
            thumbnailUrl: null,
            link: 'https://www.youtube.com/watch?v=tapivideo01',
          },
        ],
      });

      const snapshot = await fetchChannelSnapshot({
        channelPageUrl: CHANNEL_PAGE_URL,
        rssUrl: RSS_URL,
      });

      expect(snapshot.videos.map((v) => v.videoId)).toEqual(['tapivideo01']);
      expect(snapshot.fetchedVia).toBe('transcript_api');
    });

    it('tags the scrape-only fallback as scrape', async () => {
      (isDataApiConfigured as jest.Mock).mockReturnValue(false);
      (scrapeChannel as jest.Mock).mockResolvedValue({
        channelId: CHANNEL_ID,
        name: 'Scraped Channel',
        logoUrl: null,
        handle: '@scraped',
        videos: [
          {
            videoId: 'scrapevid01',
            title: 'Scraped',
            description: '',
            publishedAt: null,
            durationSeconds: 300,
          },
        ],
        upcomingVideoIds: [],
        memberOnlyVideoIds: [],
      });
      (fetchRssFeed as jest.Mock).mockRejectedValue(new Error('RSS 404'));
      (fetchChannelLatest as jest.Mock).mockRejectedValue(new Error('TApi down'));

      const snapshot = await fetchChannelSnapshot({
        channelPageUrl: CHANNEL_PAGE_URL,
        rssUrl: RSS_URL,
      });

      expect(snapshot.fetchedVia).toBe('scrape');
    });
  });
});
