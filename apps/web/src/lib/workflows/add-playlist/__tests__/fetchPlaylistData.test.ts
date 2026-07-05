/**
 * Orchestration-order tests for fetchPlaylistData: Data API first,
 * then RSS, then page scrape. The per-source fetchers are
 * module-mocked; their parsing is covered by their own test suites.
 */
import { fetchRssFeed } from '@/lib/platforms/youtube/channelRss';
import { fetchPlaylistViaDataApi, isDataApiConfigured } from '@/lib/platforms/youtube/dataApi';
import { scrapePlaylist } from '@/lib/platforms/youtube/playlistScrape';
import { fetchPlaylistData } from '@/lib/workflows/add-playlist';

jest.mock('@readtube/database', () => ({
  VideoPlatformType: { YOUTUBE: 'YOUTUBE', BILIBILI: 'BILIBILI' },
  prisma: {},
}));
jest.mock('@/lib/platforms/youtube/dataApi', () => ({
  isDataApiConfigured: jest.fn(),
  fetchPlaylistViaDataApi: jest.fn(),
}));
jest.mock('@/lib/platforms/youtube/channelRss', () => ({
  ...jest.requireActual('@/lib/platforms/youtube/channelRss'),
  fetchRssFeed: jest.fn(),
}));
jest.mock('@/lib/platforms/youtube/playlistScrape', () => ({
  ...jest.requireActual('@/lib/platforms/youtube/playlistScrape'),
  scrapePlaylist: jest.fn(),
}));

const PLAYLIST_ID = 'PLtestplaylist12';

function dataApiPlaylist(videos = [dataApiVideo()]) {
  return {
    title: 'Data API Playlist',
    channelId: 'UCowner0000000000000000',
    channelName: 'Owner',
    videos,
  };
}

function dataApiVideo() {
  return {
    videoId: 'dQw4w9WgXcQ',
    title: 'Video',
    description: 'desc',
    publishedAt: new Date('2024-06-01T00:00:00Z'),
    thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    durationSeconds: 630,
    channelId: 'UCuploader000000000000',
    channelName: 'Uploader',
  };
}

function mockRssSuccess(): void {
  (fetchRssFeed as jest.Mock).mockResolvedValue({
    channelId: 'UCowner0000000000000000',
    name: 'RSS Playlist',
    authorName: 'RSS Owner',
    videos: [],
  });
}

describe('fetchPlaylistData orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the Data API playlist without calling RSS or scrape', async () => {
    (isDataApiConfigured as jest.Mock).mockReturnValue(true);
    (fetchPlaylistViaDataApi as jest.Mock).mockResolvedValue(dataApiPlaylist());

    const feed = await fetchPlaylistData(PLAYLIST_ID);

    expect(feed.name).toBe('Data API Playlist');
    expect(feed.channelName).toBe('Owner');
    expect(feed.videos.map((v) => v.videoId)).toEqual(['dQw4w9WgXcQ']);
    expect(feed.videos[0]!.durationSeconds).toBe(630);
    expect(fetchRssFeed).not.toHaveBeenCalled();
    expect(scrapePlaylist).not.toHaveBeenCalled();
  });

  it('does not call the Data API when YOUTUBE_API_KEY is not configured', async () => {
    (isDataApiConfigured as jest.Mock).mockReturnValue(false);
    mockRssSuccess();

    const feed = await fetchPlaylistData(PLAYLIST_ID);

    expect(fetchPlaylistViaDataApi).not.toHaveBeenCalled();
    expect(feed.name).toBe('RSS Playlist');
  });

  it.each([
    ['throws (private, Mix, quota, network)', () => Promise.reject(new Error('no playlist'))],
    ['returns zero videos', () => Promise.resolve(dataApiPlaylist([]))],
  ])('falls back to RSS when the Data API %s', async (_label, impl) => {
    (isDataApiConfigured as jest.Mock).mockReturnValue(true);
    (fetchPlaylistViaDataApi as jest.Mock).mockImplementation(impl);
    mockRssSuccess();

    const feed = await fetchPlaylistData(PLAYLIST_ID);

    expect(feed.name).toBe('RSS Playlist');
    expect(scrapePlaylist).not.toHaveBeenCalled();
  });

  it('falls back to scrape when the Data API and RSS both fail', async () => {
    (isDataApiConfigured as jest.Mock).mockReturnValue(true);
    (fetchPlaylistViaDataApi as jest.Mock).mockRejectedValue(new Error('no playlist'));
    (fetchRssFeed as jest.Mock).mockRejectedValue(new Error('RSS fetch failed: 404'));
    (scrapePlaylist as jest.Mock).mockResolvedValue({
      channelId: 'UCowner0000000000000000',
      channelName: 'Scrape Owner',
      title: 'Scraped Playlist',
      videos: [],
    });

    const feed = await fetchPlaylistData(PLAYLIST_ID);

    expect(feed.name).toBe('Scraped Playlist');
  });
});
