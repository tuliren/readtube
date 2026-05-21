import { extractVideoId, fetchVideoSnapshot, parseIsoDurationSeconds } from '../videoSnapshot';

const VALID_VIDEO_ID = 'dQw4w9WgXcQ';

function buildWatchPageHtml(overrides?: {
  channelId?: string | null;
  title?: string | null;
  description?: string;
  duration?: string;
  publishedAt?: string | null;
  ownerProfileUrl?: string;
}): string {
  const channelId = overrides?.channelId ?? 'UCBJycsmduvYEL83R_U4JriQ';
  const title = overrides?.title ?? 'Test Watch Page Video';
  const description = overrides?.description ?? 'page description';
  const duration = overrides?.duration ?? 'PT3M33S';
  const published = overrides?.publishedAt ?? '2024-06-01T00:00:00Z';
  const ownerUrl = overrides?.ownerProfileUrl ?? 'https://www.youtube.com/@MarquesBrownlee';
  const meta: string[] = [];
  if (channelId != null) {
    meta.push(`<meta itemprop="identifier" content="${channelId}"/>`);
  }
  if (title != null) {
    meta.push(`<meta name="title" content="${title}"/>`);
  }
  meta.push(`<meta name="description" content="${description}"/>`);
  meta.push(`<meta itemprop="duration" content="${duration}"/>`);
  if (published != null) {
    meta.push(`<meta itemprop="datePublished" content="${published}"/>`);
  }
  meta.push(`"ownerProfileUrl":"${ownerUrl}"`);
  return `<html><head>${meta.join('\n')}</head><body></body></html>`;
}

describe('extractVideoId', () => {
  it.each([
    ['bare 11-char id', VALID_VIDEO_ID, VALID_VIDEO_ID],
    ['watch URL', `https://www.youtube.com/watch?v=${VALID_VIDEO_ID}`, VALID_VIDEO_ID],
    ['watch URL no www', `https://youtube.com/watch?v=${VALID_VIDEO_ID}`, VALID_VIDEO_ID],
    ['youtu.be short URL', `https://youtu.be/${VALID_VIDEO_ID}`, VALID_VIDEO_ID],
    ['youtu.be with query', `https://youtu.be/${VALID_VIDEO_ID}?t=42`, VALID_VIDEO_ID],
    ['shorts URL', `https://www.youtube.com/shorts/${VALID_VIDEO_ID}`, VALID_VIDEO_ID],
    ['embed URL', `https://www.youtube.com/embed/${VALID_VIDEO_ID}`, VALID_VIDEO_ID],
    [
      'watch URL with extra params',
      `https://www.youtube.com/watch?v=${VALID_VIDEO_ID}&list=PL123`,
      VALID_VIDEO_ID,
    ],
    ['protocol-less watch URL', `youtube.com/watch?v=${VALID_VIDEO_ID}`, VALID_VIDEO_ID],
    ['protocol-less youtu.be URL', `youtu.be/${VALID_VIDEO_ID}`, VALID_VIDEO_ID],
    ['protocol-less shorts URL', `www.youtube.com/shorts/${VALID_VIDEO_ID}`, VALID_VIDEO_ID],
  ])('extracts from %s', (_label, input, expected) => {
    expect(extractVideoId(input)).toBe(expected);
  });

  it.each([
    ['empty string', ''],
    ['non-youtube URL', 'https://vimeo.com/12345'],
    ['channel URL', 'https://youtube.com/@mkbhd'],
    ['random text', 'not a url'],
    ['short bare id', 'abc'],
    ['null', null as unknown as string],
  ])('returns null for %s', (_label, input) => {
    expect(extractVideoId(input)).toBeNull();
  });
});

describe('parseIsoDurationSeconds', () => {
  it.each([
    ['hours minutes seconds', 'PT1H2M3S', 3723],
    ['minutes seconds', 'PT5M30S', 330],
    ['seconds only', 'PT45S', 45],
    ['hours only', 'PT2H', 7200],
    ['minutes only', 'PT10M', 600],
  ])('parses %s', (_label, input, expected) => {
    expect(parseIsoDurationSeconds(input)).toBe(expected);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['zero duration', 'PT0S'],
    ['malformed', 'P1Y2M'],
    ['random text', 'five minutes'],
  ])('returns null for %s', (_label, input) => {
    expect(parseIsoDurationSeconds(input)).toBeNull();
  });
});

describe('fetchVideoSnapshot orchestration', () => {
  const originalEnv = process.env;
  const watchUrl = `https://www.youtube.com/watch?v=${VALID_VIDEO_ID}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${VALID_VIDEO_ID}&format=json`;
  const transcriptUrl = `https://transcriptapi.com/api/v2/youtube/transcript?video_url=${VALID_VIDEO_ID}&send_metadata=true`;

  beforeEach(() => {
    process.env = { ...originalEnv, TRANSCRIPT_API_KEY: 'test-key' };
    jest.spyOn(globalThis, 'fetch');
    // Don't pollute test output with the expected warn/info logs.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  function mockOEmbed(): void {
    (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === oembedUrl) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            title: 'oEmbed Title',
            author_name: 'MKBHD',
            author_url: 'https://www.youtube.com/@MarquesBrownlee',
            thumbnail_url: 'https://i.ytimg.com/vi/xx/hqdefault.jpg',
          }),
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
  }

  it('uses the watch page when it returns 200 and does not call TranscriptAPI', async () => {
    (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === oembedUrl) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            title: 'oEmbed Title',
            author_name: 'MKBHD',
            author_url: 'https://www.youtube.com/@MarquesBrownlee',
            thumbnail_url: 'https://i.ytimg.com/vi/xx/hqdefault.jpg',
          }),
        });
      }
      if (url === watchUrl) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => buildWatchPageHtml(),
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const result = await fetchVideoSnapshot(VALID_VIDEO_ID);

    expect(result.prefetchedTranscript).toBeNull();
    expect(result.snapshot.channel.sourceId).toBe('UCBJycsmduvYEL83R_U4JriQ');
    expect(result.snapshot.title).toBe('oEmbed Title');
    expect(result.snapshot.channel.handle).toBe('@MarquesBrownlee');
    expect(result.snapshot.durationSeconds).toBe(213);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect((globalThis.fetch as jest.Mock).mock.calls.some(([u]) => u === transcriptUrl)).toBe(
      false
    );
  });

  it('falls back to TranscriptAPI when the watch page returns 429', async () => {
    const resolveUrl =
      'https://transcriptapi.com/api/v2/youtube/channel/resolve?input=https%3A%2F%2Fwww.youtube.com%2F%40RickAstley';

    (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === oembedUrl) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            title: 'irrelevant',
            author_name: '',
            author_url: '',
            thumbnail_url: '',
          }),
        });
      }
      if (url === watchUrl) {
        return Promise.resolve({ ok: false, status: 429, text: async () => '' });
      }
      if (url === transcriptUrl) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            video_id: VALID_VIDEO_ID,
            language: 'en',
            transcript: [
              { text: 'Never gonna give you up', start: 0, duration: 4.12 },
              { text: 'Never gonna let you down', start: 4.12, duration: 3.88 },
            ],
            metadata: {
              title: 'Rick Astley - Never Gonna Give You Up',
              author_name: 'RickAstleyVEVO',
              author_url: 'https://www.youtube.com/@RickAstley',
              thumbnail_url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
            },
          }),
        });
      }
      if (url === resolveUrl) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ channel_id: 'UCuAXFkgsw1L7xaCfnd5JJOw' }),
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const result = await fetchVideoSnapshot(VALID_VIDEO_ID);

    expect(result.snapshot.title).toBe('Rick Astley - Never Gonna Give You Up');
    expect(result.snapshot.channel.sourceId).toBe('UCuAXFkgsw1L7xaCfnd5JJOw');
    expect(result.snapshot.channel.name).toBe('RickAstleyVEVO');
    expect(result.snapshot.channel.handle).toBe('@RickAstley');
    expect(result.snapshot.thumbnailUrl).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg');
    // Endpoint omits these — should pass through as null/empty so downstream upserts can backfill.
    expect(result.snapshot.publishedAt).toBeNull();
    expect(result.snapshot.durationSeconds).toBeNull();
    expect(result.snapshot.description).toBe('');

    expect(result.prefetchedTranscript).not.toBeNull();
    expect(result.prefetchedTranscript!.language).toBe('en');
    expect(result.prefetchedTranscript!.segments).toEqual([
      { startMs: 0, endMs: 4120, text: 'Never gonna give you up' },
      { startMs: 4120, endMs: 8000, text: 'Never gonna let you down' },
    ]);
  });

  it('throws when both the watch page and TranscriptAPI fail', async () => {
    mockOEmbed();
    (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === oembedUrl) {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url === watchUrl) {
        return Promise.resolve({ ok: false, status: 429, text: async () => '' });
      }
      if (url === transcriptUrl) {
        return Promise.resolve({ ok: false, status: 502, text: async () => 'bad gateway' });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    await expect(fetchVideoSnapshot(VALID_VIDEO_ID)).rejects.toThrow(
      'TranscriptAPI /youtube/transcript 502: bad gateway'
    );
  });

  it('throws on TranscriptAPI fallback when metadata block is missing', async () => {
    (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === oembedUrl) {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url === watchUrl) {
        return Promise.resolve({ ok: false, status: 429, text: async () => '' });
      }
      if (url === transcriptUrl) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            video_id: VALID_VIDEO_ID,
            language: 'en',
            transcript: [],
            // metadata intentionally absent
          }),
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    await expect(fetchVideoSnapshot(VALID_VIDEO_ID)).rejects.toThrow(
      /missing required metadata block/
    );
  });
});
