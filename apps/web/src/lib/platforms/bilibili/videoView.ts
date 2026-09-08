import { fetchBilibiliVideoDetailViaJustOneApi } from './justOneApi';
import { type BilibiliViewData, toBilibiliViewData } from './viewData';

const BILIBILI_VIEW_URL = 'https://api.bilibili.com/x/web-interface/view';

/**
 * Deliberately not a browser UA. Bilibili's risk control answers a
 * browser-looking User-Agent that carries no cookies with HTTP 412
 * (`code: -412, "request was banned"`), from Vercel's egress and from
 * residential IPs alike, while a plain non-browser UA gets a normal
 * `code: 0` payload from both. Verified on a preview deployment: the
 * same add-video request that fell back to JustOneAPI with a Chrome
 * UA was answered directly with this one. Exported so the dev probe
 * script compares like with like.
 */
export const BILIBILI_USER_AGENT = 'readtube/1.0 (+https://read.tube)';

/**
 * When Bilibili does block a request it answers with an instant 412,
 * so the timeout only matters if it ever starts black-holing requests
 * instead: the free attempt must not stall add-video before the
 * fallback runs. It covers the body read as well as the headers.
 */
const DIRECT_VIEW_TIMEOUT_MS = 5000;

/**
 * In-body codes that say nothing about the video: Bilibili refused or
 * failed to serve the request itself. Any of these counts as "no
 * answer", so the paid fallback gets to ask instead. Every other
 * non-zero code (-400 bad request, -403 permission denied, -404 no
 * such video, 62002 not visible, 62004 under review, 62012 owner-only,
 * ...) is an authoritative answer about the video and is not worth
 * paying to hear again.
 */
const BILIBILI_NO_ANSWER_CODES = new Set<number>([
  -352, // risk-control validation failed
  -412, // request was banned (usually paired with HTTP 412)
  -500, // server error
  -503, // overload protection
  -504, // upstream timeout
  -509, // rate limited
  -799, // too many requests
]);

/**
 * Bilibili answered, and the answer is "no": the video is deleted,
 * private, nonexistent, etc. Distinct from a transport failure so
 * callers (and the fallback below) don't pay to ask again.
 */
export class BilibiliViewError extends Error {
  readonly code: number;

  constructor(message: string, code: number) {
    super(message);
    this.name = 'BilibiliViewError';
    this.code = code;
    Object.setPrototypeOf(this, BilibiliViewError.prototype);
  }
}

/**
 * Fetch a video's view data: Bilibili's own endpoint first (free),
 * JustOneAPI's video-detail endpoint when that is blocked (paid).
 *
 * The fallback runs only when Bilibili didn't actually answer — a
 * non-2xx status (412 from risk control, 5xx), a network error or
 * timeout, an unparsable or malformed body, or an in-body code from
 * `BILIBILI_NO_ANSWER_CODES`. Any other non-zero `code` is Bilibili's
 * authoritative answer about the video and is rethrown as
 * {@link BilibiliViewError} without spending a JustOneAPI call: it
 * would only say the same thing.
 *
 * Both sources go through `toBilibiliViewData`, so consumers see one
 * shape regardless of which one served the request.
 */
export async function fetchBilibiliVideoView(bvid: string): Promise<BilibiliViewData> {
  let directError: Error;
  try {
    return await fetchDirect(bvid);
  } catch (err) {
    if (err instanceof BilibiliViewError) {
      throw err;
    }
    directError = err instanceof Error ? err : new Error(String(err));
  }

  console.info(
    `[bilibili/videoView] direct view failed for ${bvid} (${directError.message}); falling back to JustOneAPI`
  );
  try {
    return await fetchBilibiliVideoDetailViaJustOneApi(bvid);
  } catch (fallbackErr) {
    const message = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
    throw new Error(
      `Bilibili view API unavailable (${directError.message}); JustOneAPI fallback failed: ${message}`
    );
  }
}

async function fetchDirect(bvid: string): Promise<BilibiliViewData> {
  const url = `${BILIBILI_VIEW_URL}?bvid=${encodeURIComponent(bvid)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIRECT_VIEW_TIMEOUT_MS);
  let json: { code?: unknown; message?: unknown; data?: unknown };
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': BILIBILI_USER_AGENT,
        Referer: 'https://www.bilibili.com/',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Bilibili view API returned HTTP ${res.status}`);
    }
    json = await res.json();
  } finally {
    clearTimeout(timer);
  }

  if (typeof json.code !== 'number') {
    throw new Error('Bilibili view API returned a malformed body');
  }
  const message = typeof json.message === 'string' ? json.message : '';
  if (BILIBILI_NO_ANSWER_CODES.has(json.code)) {
    throw new Error(`Bilibili view API refused the request: code=${json.code} message=${message}`);
  }
  if (json.code !== 0) {
    throw new BilibiliViewError(
      `Bilibili view API error: code=${json.code} message=${message}`,
      json.code
    );
  }
  const data = toBilibiliViewData(json.data);
  if (data == null) {
    throw new Error('Bilibili view API returned no usable data');
  }
  return data;
}

/**
 * aid + cid for a bvid, as JustOneAPI's captions endpoint wants them.
 * cid comes from the first part (each part of a multi-part video has
 * its own), falling back to the top-level `cid`.
 */
export async function resolveBilibiliAidCid(bvid: string): Promise<{ aid: string; cid: string }> {
  const view = await fetchBilibiliVideoView(bvid);
  const cid = view.pages[0]?.cid ?? view.cid;
  if (view.aid == null || cid == null) {
    throw new Error(`Bilibili view data for ${bvid} is missing aid or cid`);
  }
  return { aid: String(view.aid), cid: String(cid) };
}
