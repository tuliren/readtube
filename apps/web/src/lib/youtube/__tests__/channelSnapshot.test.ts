import { mergeSnapshot } from '@/lib/youtube/channelSnapshot';
import type { RssChannel, RssVideo } from '@/lib/youtube/rss';
import type { ScrapedChannel } from '@/lib/youtube/scrapeChannel';

function rssVideo(overrides: Partial<RssVideo> & Pick<RssVideo, 'videoId'>): RssVideo {
  const { videoId } = overrides;
  return {
    title: `Title ${videoId}`,
    description: `Desc ${videoId}`,
    publishedAt: new Date('2026-04-01T00:00:00Z'),
    link: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: null,
    ...overrides,
  };
}

function rssFeed(videos: RssVideo[]): RssChannel {
  return { channelId: 'UC_abc', name: 'Test Channel', videos };
}

function scrapedChannel(overrides: Partial<ScrapedChannel> = {}): ScrapedChannel {
  return {
    channelId: 'UC_abc',
    name: 'Test Channel',
    logoUrl: null,
    handle: null,
    videos: [],
    ...overrides,
  };
}

describe('mergeSnapshot', () => {
  it('uses RSS as the source of truth for title/description/publishedAt', async () => {
    const feed = rssFeed([
      rssVideo({
        videoId: 'v1',
        title: 'RSS Title',
        description: 'Full RSS description',
        publishedAt: new Date('2026-03-15T10:00:00Z'),
      }),
    ]);
    const scraped = scrapedChannel({
      videos: [
        {
          videoId: 'v1',
          title: 'Scraped Title (truncated)',
          description: 'Scraped desc (cut off)...',
          publishedAt: new Date('2026-04-10T00:00:00Z'),
          durationSeconds: 300,
        },
      ],
    });

    const snap = mergeSnapshot(feed, scraped);

    expect(snap.videos).toHaveLength(1);
    expect(snap.videos[0]!.title).toBe('RSS Title');
    expect(snap.videos[0]!.description).toBe('Full RSS description');
    expect(snap.videos[0]!.publishedAt).toEqual(new Date('2026-03-15T10:00:00Z'));
  });

  it('merges durationSeconds from scrape by videoId', async () => {
    const feed = rssFeed([rssVideo({ videoId: 'v1' }), rssVideo({ videoId: 'v2' })]);
    const scraped = scrapedChannel({
      videos: [
        {
          videoId: 'v1',
          title: '',
          description: '',
          publishedAt: new Date(),
          durationSeconds: 754,
        },
      ],
    });

    const snap = mergeSnapshot(feed, scraped);

    expect(snap.videos.find((v) => v.videoId === 'v1')!.durationSeconds).toBe(754);
    expect(snap.videos.find((v) => v.videoId === 'v2')!.durationSeconds).toBeNull();
  });

  it('filters out Shorts by RSS /shorts/ link', async () => {
    const feed = rssFeed([
      rssVideo({ videoId: 'v_real', link: 'https://www.youtube.com/watch?v=v_real' }),
      rssVideo({ videoId: 'v_short', link: 'https://www.youtube.com/shorts/v_short' }),
    ]);

    const snap = mergeSnapshot(feed, null);

    expect(snap.videos.map((v) => v.videoId)).toEqual(['v_real']);
  });

  it.each([
    {
      name: 'uses RSS thumbnail when present',
      rssThumb: 'https://i4.ytimg.com/vi/v1/hqdefault.jpg',
      expected: 'https://i4.ytimg.com/vi/v1/hqdefault.jpg',
    },
    {
      name: 'falls back to buildThumbnailUrl when RSS omits thumbnail',
      rssThumb: null,
      expected: 'https://i.ytimg.com/vi/v1/hqdefault.jpg',
    },
  ])('thumbnailUrl: $name', async ({ rssThumb, expected }) => {
    const feed = rssFeed([rssVideo({ videoId: 'v1', thumbnailUrl: rssThumb })]);

    const snap = mergeSnapshot(feed, null);

    expect(snap.videos[0]!.thumbnailUrl).toBe(expected);
  });

  it('propagates channel handle and logo from scrape', async () => {
    const feed = rssFeed([]);
    const scraped = scrapedChannel({
      logoUrl: 'https://logo.example/a.jpg',
      handle: '@mkbhd',
    });

    const snap = mergeSnapshot(feed, scraped);

    expect(snap.logoUrl).toBe('https://logo.example/a.jpg');
    expect(snap.handle).toBe('@mkbhd');
  });

  it('returns null handle/logo and null durations when scrape is null (scrape failed)', async () => {
    const feed = rssFeed([rssVideo({ videoId: 'v1' })]);

    const snap = mergeSnapshot(feed, null);

    expect(snap.handle).toBeNull();
    expect(snap.logoUrl).toBeNull();
    expect(snap.videos[0]!.durationSeconds).toBeNull();
    // Thumbnail still populated via buildThumbnailUrl fallback.
    expect(snap.videos[0]!.thumbnailUrl).toBe('https://i.ytimg.com/vi/v1/hqdefault.jpg');
  });
});
