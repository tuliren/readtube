import { fetchRssFeed } from '@/lib/youtube/channelRss';

// Minimal fixture built from a real `feeds/videos.xml` response: one
// regular video and one Short, so we can lock in the `/watch?v=` vs
// `/shorts/` link distinction used by ingest's Shorts filter.
const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <id>yt:channel:UC_test</id>
 <yt:channelId>UC_test</yt:channelId>
 <title>Sample Channel</title>
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UC_test"/>
 <link rel="alternate" href="https://www.youtube.com/channel/UC_test"/>
 <entry>
  <id>yt:video:abc123</id>
  <yt:videoId>abc123</yt:videoId>
  <title>Regular Video</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
  <published>2026-04-11T13:00:44+00:00</published>
  <media:group>
   <media:title>Regular Video</media:title>
   <media:thumbnail url="https://i4.ytimg.com/vi/abc123/hqdefault.jpg" width="480" height="360"/>
   <media:description>A real video description.</media:description>
  </media:group>
 </entry>
 <entry>
  <id>yt:video:xyz789</id>
  <yt:videoId>xyz789</yt:videoId>
  <title>A Short</title>
  <link rel="alternate" href="https://www.youtube.com/shorts/xyz789"/>
  <published>2026-04-03T15:48:41+00:00</published>
  <media:group>
   <media:title>A Short</media:title>
   <media:thumbnail url="https://i4.ytimg.com/vi/xyz789/hqdefault.jpg" width="480" height="360"/>
   <media:description></media:description>
  </media:group>
 </entry>
</feed>`;

describe('fetchRssFeed', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = jest.fn(
      async () =>
        ({
          ok: true,
          text: async () => SAMPLE_RSS,
        }) as Response
    );
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses channel metadata', async () => {
    const feed = await fetchRssFeed('https://example.com/rss.xml');

    expect(feed.channelId).toBe('UC_test');
    expect(feed.name).toBe('Sample Channel');
    expect(feed.videos).toHaveLength(2);
  });

  it.each([
    {
      name: 'regular /watch video',
      index: 0,
      videoId: 'abc123',
      link: 'https://www.youtube.com/watch?v=abc123',
      description: 'A real video description.',
    },
    {
      name: 'Short /shorts video',
      index: 1,
      videoId: 'xyz789',
      link: 'https://www.youtube.com/shorts/xyz789',
      description: '',
    },
  ])('preserves link and metadata for $name', async ({ index, videoId, link, description }) => {
    const feed = await fetchRssFeed('https://example.com/rss.xml');
    const video = feed.videos[index]!;

    expect(video.videoId).toBe(videoId);
    expect(video.link).toBe(link);
    expect(video.description).toBe(description);
    expect(video.thumbnailUrl).toBe(`https://i4.ytimg.com/vi/${videoId}/hqdefault.jpg`);
  });

  it('throws on non-ok response', async () => {
    globalThis.fetch = jest.fn(
      async () =>
        ({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        }) as Response
    );

    await expect(fetchRssFeed('https://example.com/rss.xml')).rejects.toThrow(/RSS fetch failed/);
  });
});
