import { fetchBilibiliVideoDetailViaJustOneApi } from '../justOneApi';
import {
  BILIBILI_USER_AGENT,
  BilibiliViewError,
  fetchBilibiliVideoView,
  resolveBilibiliAidCid,
} from '../videoView';
import type { BilibiliViewData } from '../viewData';

jest.mock('../justOneApi', () => ({
  ...jest.requireActual('../justOneApi'),
  fetchBilibiliVideoDetailViaJustOneApi: jest.fn(),
}));

const mockFallback = fetchBilibiliVideoDetailViaJustOneApi as jest.MockedFunction<
  typeof fetchBilibiliVideoDetailViaJustOneApi
>;
const mockFetch = jest.fn();

const BVID = 'BV1TEST000001';

function rawView(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    bvid: BVID,
    aid: 123456,
    cid: 777,
    title: 'A video',
    desc: 'desc',
    pic: '//i0.hdslb.com/bfs/archive/cover.jpg',
    pubdate: 1760000000,
    duration: 523,
    owner: { mid: 42, name: 'Uploader', face: 'https://i0.hdslb.com/bfs/face/f.jpg' },
    pages: [{ cid: 777 }, { cid: 778 }],
    ...overrides,
  };
}

function fallbackView(): BilibiliViewData {
  return {
    bvid: BVID,
    aid: 999,
    cid: 1,
    title: 'From JustOneAPI',
    desc: null,
    pic: null,
    pubdate: null,
    duration: null,
    owner: null,
    pages: [{ cid: 1 }],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFallback.mockReset();
  (global as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchBilibiliVideoView', () => {
  it('returns the direct response and never touches JustOneAPI when Bilibili answers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ code: 0, message: '0', data: rawView() }));

    const view = await fetchBilibiliVideoView(BVID);

    expect(view.title).toBe('A video');
    expect(view.aid).toBe(123456);
    expect(view.owner).toEqual({
      mid: 42,
      name: 'Uploader',
      face: 'https://i0.hdslb.com/bfs/face/f.jpg',
    });
    expect(view.pages).toEqual([{ cid: 777 }, { cid: 778 }]);
    expect(mockFallback).not.toHaveBeenCalled();
    // The free attempt is bounded by a timeout signal.
    const init = mockFetch.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // Bilibili's risk control 412s a browser-looking UA that carries no
    // cookies; the constant has to stay a plain non-browser one.
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(BILIBILI_USER_AGENT);
    expect(BILIBILI_USER_AGENT).not.toMatch(/Mozilla/);
  });

  it.each([
    {
      label: 'HTTP 412 (risk control)',
      direct: () => mockFetch.mockResolvedValueOnce(jsonResponse({ code: -412 }, 412)),
    },
    {
      label: 'HTTP 500',
      direct: () => mockFetch.mockResolvedValueOnce(new Response('nope', { status: 500 })),
    },
    {
      label: 'a network error',
      direct: () => mockFetch.mockRejectedValueOnce(new TypeError('fetch failed')),
    },
    {
      label: 'an abort (timeout)',
      direct: () => mockFetch.mockRejectedValueOnce(new DOMException('aborted', 'AbortError')),
    },
    {
      label: 'a 200 carrying the in-body banned code',
      direct: () =>
        mockFetch.mockResolvedValueOnce(
          jsonResponse({ code: -412, message: 'request was banned', ttl: 1 })
        ),
    },
    {
      label: 'a 200 carrying the risk-control code -352',
      direct: () =>
        mockFetch.mockResolvedValueOnce(jsonResponse({ code: -352, message: '-352', ttl: 1 })),
    },
    {
      label: 'a 200 carrying the rate-limit code -509',
      direct: () =>
        mockFetch.mockResolvedValueOnce(jsonResponse({ code: -509, message: '超出限制' })),
    },
    {
      label: 'a malformed body',
      direct: () => mockFetch.mockResolvedValueOnce(jsonResponse({ hello: 'world' })),
    },
    {
      label: 'a 200 with code 0 but no usable data',
      direct: () => mockFetch.mockResolvedValueOnce(jsonResponse({ code: 0, message: '0' })),
    },
  ])('falls back to JustOneAPI after $label', async ({ direct }) => {
    direct();
    mockFallback.mockResolvedValueOnce(fallbackView());

    const view = await fetchBilibiliVideoView(BVID);

    expect(view.title).toBe('From JustOneAPI');
    expect(mockFallback).toHaveBeenCalledWith(BVID);
  });

  it.each([
    { code: -403, message: '访问权限不足' },
    { code: -404, message: '啥都木有' },
    { code: 62002, message: '稿件不可见' },
  ])(
    'throws BilibiliViewError without a paid retry when Bilibili answers code=$code',
    async ({ code, message }) => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ code, message }));

      const promise = fetchBilibiliVideoView(BVID);

      await expect(promise).rejects.toBeInstanceOf(BilibiliViewError);
      await expect(promise).rejects.toMatchObject({
        code,
        message: expect.stringContaining(message),
      });
      expect(mockFallback).not.toHaveBeenCalled();
    }
  );

  it('reports both failures when the fallback fails too', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ code: -412 }, 412));
    mockFallback.mockRejectedValueOnce(new Error('JustOneAPI code=302 msg=rate limited'));

    await expect(fetchBilibiliVideoView(BVID)).rejects.toThrow(
      'Bilibili view API unavailable (Bilibili view API returned HTTP 412); JustOneAPI fallback failed: JustOneAPI code=302 msg=rate limited'
    );
  });
});

describe('resolveBilibiliAidCid', () => {
  it.each([
    { label: 'the first page cid', overrides: {}, cid: '777' },
    { label: 'the top-level cid when there are no pages', overrides: { pages: [] }, cid: '777' },
    {
      label: 'the top-level cid when the first page has none',
      overrides: { pages: [{ page: 1 }] },
      cid: '777',
    },
  ])('returns aid with $label', async ({ overrides, cid }) => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 0, message: '0', data: rawView(overrides) })
    );

    await expect(resolveBilibiliAidCid(BVID)).resolves.toEqual({ aid: '123456', cid });
  });

  it.each([
    { label: 'aid', overrides: { aid: undefined } },
    { label: 'every cid', overrides: { cid: undefined, pages: [] } },
  ])('throws when the view data has no $label', async ({ overrides }) => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 0, message: '0', data: rawView(overrides) })
    );

    await expect(resolveBilibiliAidCid(BVID)).rejects.toThrow('missing aid or cid');
  });
});
