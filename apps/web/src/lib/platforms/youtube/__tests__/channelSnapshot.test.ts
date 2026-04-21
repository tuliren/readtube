import type { RssChannel, RssVideo } from '@/lib/platforms/youtube/channelRss';
import type { ScrapedChannel, ScrapedVideo } from '@/lib/platforms/youtube/channelScrape';
import { buildSnapshotFromScrape, mergeSnapshot } from '@/lib/platforms/youtube/channelSnapshot';

function rssVideo(overrides: Partial<RssVideo> & Pick<RssVideo, 'videoId'>): RssVideo {
  const { videoId } = overrides;
  return {
    title: `Title ${videoId}`,
    description: `Desc ${videoId}`,
    publishedAt: new Date('2026-04-01T00:00:00Z'),
    link: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: null,
    channelId: null,
    channelName: null,
    ...overrides,
  };
}

function rssFeed(videos: RssVideo[]): RssChannel {
  return { channelId: 'UC_abc', name: 'Test Channel', authorName: 'Test Channel', videos };
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

  it('appends scrape-only older videos as backfill entries', () => {
    const feed = rssFeed([rssVideo({ videoId: 'v1' }), rssVideo({ videoId: 'v2' })]);
    const scraped = scrapedChannel({
      videos: [
        {
          videoId: 'v1',
          title: 'Scraped v1',
          description: 'snippet',
          publishedAt: new Date('2026-04-01T00:00:00Z'),
          durationSeconds: 300,
        },
        {
          videoId: 'v_old1',
          title: 'Old video 1 (truncated...)',
          description: 'old snippet',
          publishedAt: new Date('2026-01-15T00:00:00Z'),
          durationSeconds: 900,
        },
        {
          videoId: 'v_old2',
          title: 'Old video 2',
          description: '',
          publishedAt: null,
          durationSeconds: 600,
        },
      ],
    });

    const snap = mergeSnapshot(feed, scraped);

    expect(snap.videos.map((v) => v.videoId)).toEqual(['v1', 'v2', 'v_old1', 'v_old2']);

    const old1 = snap.videos.find((v) => v.videoId === 'v_old1')!;
    expect(old1.isBackfill).toBe(true);
    expect(old1.title).toBe('Old video 1 (truncated...)');
    expect(old1.durationSeconds).toBe(900);
    expect(old1.link).toBe('https://www.youtube.com/watch?v=v_old1');
    expect(old1.thumbnailUrl).toBe('https://i.ytimg.com/vi/v_old1/hqdefault.jpg');

    const old2 = snap.videos.find((v) => v.videoId === 'v_old2')!;
    expect(old2.isBackfill).toBe(true);
    expect(old2.publishedAt).toBeNull();

    // RSS-sourced videos are not flagged as backfill.
    expect(snap.videos.find((v) => v.videoId === 'v1')!.isBackfill).toBeUndefined();
    expect(snap.videos.find((v) => v.videoId === 'v2')!.isBackfill).toBeUndefined();
  });

  it('does not double-count videos present in both RSS and scrape', () => {
    const feed = rssFeed([rssVideo({ videoId: 'v1' })]);
    const scraped = scrapedChannel({
      videos: [
        {
          videoId: 'v1',
          title: 'Scraped',
          description: '',
          publishedAt: null,
          durationSeconds: 500,
        },
      ],
    });

    const snap = mergeSnapshot(feed, scraped);

    expect(snap.videos).toHaveLength(1);
    expect(snap.videos[0]!.isBackfill).toBeUndefined();
    // Duration still merged from scrape.
    expect(snap.videos[0]!.durationSeconds).toBe(500);
  });
});

function scrapedVideo(
  overrides: Partial<ScrapedVideo> & Pick<ScrapedVideo, 'videoId'>
): ScrapedVideo {
  const { videoId } = overrides;
  return {
    title: `Title ${videoId}`,
    description: `Desc ${videoId}`,
    publishedAt: new Date('2026-04-01T00:00:00Z'),
    durationSeconds: 300,
    ...overrides,
  };
}

describe('buildSnapshotFromScrape', () => {
  it('builds a snapshot from scrape data with correct links and thumbnails', () => {
    const scraped = scrapedChannel({
      handle: '@testchannel',
      logoUrl: 'https://logo.example/pic.jpg',
      videos: [scrapedVideo({ videoId: 'v1', durationSeconds: 600 })],
    });

    const snap = buildSnapshotFromScrape(scraped);

    expect(snap.channelId).toBe('UC_abc');
    expect(snap.handle).toBe('@testchannel');
    expect(snap.logoUrl).toBe('https://logo.example/pic.jpg');
    expect(snap.videos).toHaveLength(1);
    expect(snap.videos[0]!.link).toBe('https://www.youtube.com/watch?v=v1');
    expect(snap.videos[0]!.thumbnailUrl).toBe('https://i.ytimg.com/vi/v1/hqdefault.jpg');
  });

  it('filters Shorts by duration (≤60s)', () => {
    const scraped = scrapedChannel({
      videos: [
        scrapedVideo({ videoId: 'v_long', durationSeconds: 300 }),
        scrapedVideo({ videoId: 'v_short', durationSeconds: 45 }),
        scrapedVideo({ videoId: 'v_edge', durationSeconds: 60 }),
      ],
    });

    const snap = buildSnapshotFromScrape(scraped);

    expect(snap.videos.map((v) => v.videoId)).toEqual(['v_long']);
  });

  it('keeps videos with null duration (unknown length)', () => {
    const scraped = scrapedChannel({
      videos: [scrapedVideo({ videoId: 'v1', durationSeconds: null })],
    });

    const snap = buildSnapshotFromScrape(scraped);

    expect(snap.videos).toHaveLength(1);
    expect(snap.videos[0]!.durationSeconds).toBeNull();
  });
});
