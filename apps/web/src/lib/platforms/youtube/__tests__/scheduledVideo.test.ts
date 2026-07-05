import { fetchScheduledStatusViaDataApi, isDataApiConfigured } from '../dataApi';
import { detectScheduledVideo, parseScheduledFromHtml } from '../scheduledVideo';

jest.mock('../dataApi', () => ({
  isDataApiConfigured: jest.fn(),
  fetchScheduledStatusViaDataApi: jest.fn(),
}));

describe('parseScheduledFromHtml', () => {
  it.each([
    [
      'isUpcoming + liveBroadcastDetails.startTimestamp',
      'foo "isUpcoming":true bar "liveBroadcastDetails":{"isLiveNow":false,"startTimestamp":"2026-05-15T10:45:00+00:00"} baz',
      new Date('2026-05-15T10:45:00.000Z'),
    ],
    [
      'isUpcoming + scheduledStartTime unix only',
      'foo "isUpcoming":true bar "scheduledStartTime":"1778841900" baz',
      new Date(1778841900 * 1000),
    ],
    [
      'isUpcoming with whitespace + ISO start',
      'foo "isUpcoming"   :  true bar "liveBroadcastDetails": { "isLiveNow":false,"startTimestamp":"2027-01-01T00:00:00+00:00" } baz',
      new Date('2027-01-01T00:00:00.000Z'),
    ],
  ])('detects scheduled (%s)', (_label, html, expectedStart) => {
    const result = parseScheduledFromHtml(html);
    expect(result.isScheduled).toBe(true);
    expect(result.source).toBe('scrape');
    expect(result.scheduledStartTime?.getTime()).toBe(expectedStart.getTime());
  });

  it('flags upcoming even when no start time is parseable', () => {
    const result = parseScheduledFromHtml('"isUpcoming":true with no other clues');
    expect(result.isScheduled).toBe(true);
    expect(result.scheduledStartTime).toBeNull();
  });

  it.each([
    ['isUpcoming false + isLiveContent false', '"isUpcoming":false bar "isLiveContent":false'],
    ['no upcoming flag at all', 'random html with nothing relevant'],
    [
      'liveBroadcastDetails present without isUpcoming',
      '"liveBroadcastDetails":{"isLiveNow":true}',
    ],
  ])('returns not scheduled (%s)', (_label, html) => {
    const result = parseScheduledFromHtml(html);
    expect(result.isScheduled).toBe(false);
    expect(result.scheduledStartTime).toBeNull();
    expect(result.source).toBe('scrape');
  });
});

describe('detectScheduledVideo orchestration', () => {
  const VIDEO_ID = 'dQw4w9WgXcQ';
  const watchUrl = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(globalThis, 'fetch');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockWatchPage(html: string): void {
    (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === watchUrl) {
        return Promise.resolve({ ok: true, text: async () => html });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
  }

  it.each([
    [
      'an upcoming premiere',
      { isUpcoming: true, scheduledStartTime: new Date('2026-08-01T15:00:00Z') },
      true,
    ],
    ['a regular video', { isUpcoming: false, scheduledStartTime: null }, false],
  ])(
    'trusts the Data API for %s without fetching the watch page',
    async (_label, apiStatus, expectedScheduled) => {
      (isDataApiConfigured as jest.Mock).mockReturnValue(true);
      (fetchScheduledStatusViaDataApi as jest.Mock).mockResolvedValue(apiStatus);

      const result = await detectScheduledVideo(VIDEO_ID);

      expect(result.isScheduled).toBe(expectedScheduled);
      expect(result.scheduledStartTime).toEqual(apiStatus.scheduledStartTime);
      expect(result.source).toBe('dataApi');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['is indeterminate (video missing)', () => Promise.resolve(null)],
    ['throws (quota, network)', () => Promise.reject(new Error('quotaExceeded'))],
  ])('falls back to the watch-page scrape when the Data API %s', async (_label, impl) => {
    (isDataApiConfigured as jest.Mock).mockReturnValue(true);
    (fetchScheduledStatusViaDataApi as jest.Mock).mockImplementation(impl);
    mockWatchPage(
      '"isUpcoming":true "liveBroadcastDetails":{"startTimestamp":"2026-08-01T15:00:00+00:00"}'
    );

    const result = await detectScheduledVideo(VIDEO_ID);

    expect(result.isScheduled).toBe(true);
    expect(result.source).toBe('scrape');
  });

  it('does not call the Data API when YOUTUBE_API_KEY is not configured', async () => {
    (isDataApiConfigured as jest.Mock).mockReturnValue(false);
    mockWatchPage('nothing relevant');

    const result = await detectScheduledVideo(VIDEO_ID);

    expect(fetchScheduledStatusViaDataApi).not.toHaveBeenCalled();
    expect(result.isScheduled).toBe(false);
    expect(result.source).toBe('scrape');
  });
});
