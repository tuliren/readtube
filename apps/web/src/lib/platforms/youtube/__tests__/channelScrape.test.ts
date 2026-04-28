import { parseDurationText, scrapeChannel } from '../channelScrape';

describe('parseDurationText', () => {
  it.each<{ input: string | null | undefined; expected: number | null; desc: string }>([
    { input: '0:42', expected: 42, desc: 'm:ss under one minute' },
    { input: '12:34', expected: 12 * 60 + 34, desc: 'mm:ss' },
    { input: '1:02:03', expected: 3600 + 2 * 60 + 3, desc: 'h:mm:ss' },
    { input: '0:00', expected: 0, desc: 'all-zero duration' },
    { input: '  4:20  ', expected: 4 * 60 + 20, desc: 'whitespace tolerated' },
    { input: '', expected: null, desc: 'empty string' },
    { input: undefined, expected: null, desc: 'undefined' },
    { input: null, expected: null, desc: 'null' },
    { input: 'LIVE', expected: null, desc: 'live placeholder is not a duration' },
    { input: '12', expected: null, desc: 'single segment is not parseable' },
    { input: '1:2:3:4', expected: null, desc: 'too many segments' },
    { input: '12:ab', expected: null, desc: 'non-digit segment rejected' },
    { input: '-1:00', expected: null, desc: 'negative segment rejected' },
  ])('$desc', ({ input, expected }) => {
    expect(parseDurationText(input)).toBe(expected);
  });
});

describe('scrapeChannel', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function videoRenderer(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
      videoId: 'placeholder',
      title: { runs: [{ text: 'Title' }] },
      lengthText: { simpleText: '12:34' },
      publishedTimeText: { simpleText: '2 weeks ago' },
      ...overrides,
    };
  }

  function buildHtml(videos: Record<string, unknown>[]): string {
    const data = {
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                title: 'Videos',
                selected: true,
                content: {
                  richGridRenderer: {
                    contents: videos.map((v) => ({
                      richItemRenderer: { content: { videoRenderer: v } },
                    })),
                  },
                },
              },
            },
          ],
        },
      },
    };
    return [
      '<html><head>',
      '<link rel="alternate" type="application/rss+xml" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv">',
      '<meta property="og:title" content="Test Channel">',
      '<meta property="og:image" content="https://logo.example/x.jpg">',
      '</head><body>',
      `<script>var ytInitialData = ${JSON.stringify(data)};</script>`,
      '</body></html>',
    ].join('');
  }

  it('skips videos with upcomingEventData (scheduled livestreams / premieres)', async () => {
    const html = buildHtml([
      videoRenderer({ videoId: 'aired_vid' }),
      videoRenderer({
        videoId: 'upcoming_stream',
        lengthText: undefined,
        publishedTimeText: undefined,
        upcomingEventData: { startTime: '9999999999' },
      }),
    ]);
    globalThis.fetch = jest.fn(
      async () =>
        ({
          ok: true,
          text: async () => html,
        }) as Response
    );

    const scraped = await scrapeChannel('https://www.youtube.com/@test');

    expect(scraped.videos.map((v) => v.videoId)).toEqual(['aired_vid']);
  });
});
