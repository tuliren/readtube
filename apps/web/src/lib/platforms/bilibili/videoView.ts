import { fetchBilibiliVideoDetailViaJustOneApi } from './justOneApi';
import { type BilibiliViewData, toBilibiliViewData } from './viewData';

const BILIBILI_VIEW_URL = 'https://api.bilibili.com/x/web-interface/view';
const BILIBILI_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

/**
 * A blocked request comes back as an instant 412 today; the timeout
 * only matters if Bilibili ever starts black-holing requests instead,
 * so the free attempt can't stall add-video before the fallback runs.
 */
const DIRECT_VIEW_TIMEOUT_MS = 5000;

/**
 * Bilibili's in-body code for "request was banned" (risk control).
 * Usually paired with HTTP 412, but treated as not-an-answer on its
 * own too — it says nothing about the video.
 */
const BILIBILI_BANNED_CODE = -412;

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
 * timeout, an unparsable or malformed body, or the in-body banned
 * code. A well-formed non-zero `code` is Bilibili's authoritative
 * answer about the video and is rethrown as {@link BilibiliViewError}
 * without spending a JustOneAPI call: it would only say the same thing.
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
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': BILIBILI_USER_AGENT,
        Referer: 'https://www.bilibili.com/',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`Bilibili view API returned HTTP ${res.status}`);
  }

  const json = (await res.json()) as { code?: unknown; message?: unknown; data?: unknown };
  if (typeof json.code !== 'number') {
    throw new Error('Bilibili view API returned a malformed body');
  }
  if (json.code === BILIBILI_BANNED_CODE) {
    throw new Error(`Bilibili view API banned the request (code=${json.code})`);
  }
  if (json.code !== 0) {
    throw new BilibiliViewError(
      `Bilibili view API error: code=${json.code} message=${typeof json.message === 'string' ? json.message : ''}`,
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
