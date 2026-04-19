/**
 * Third-party wrapper around Bilibili's channel / upload-list data.
 * We delegate the IP-reputation and risk-control problem to
 * justoneapi.com — they run their own collectors and expose a simple
 * token-auth HTTP API.
 *
 * Docs: https://docs.justoneapi.com/zh/api/bilibili/user-published-videos-v2
 *
 * Auth: `?token=<JUSTONEAPI_TOKEN>` query parameter.
 * Endpoint: `GET https://api.justoneapi.com/api/bilibili/get-user-video-list/v2`
 *
 * Response envelope (verified against a real response):
 *
 *   {
 *     code: 0,                           // JustOneAPI outer code
 *     data: {                            // passthrough from Bilibili
 *       code, message, ttl,
 *       data: {                          // the interesting bits
 *         item: [                        // list of videos
 *           { bvid, title, cover, duration (seconds), ctime (seconds),
 *             author, subtitle, play, ... }
 *         ],
 *         count, has_next, has_prev, order, episodic_button,
 *         last_watched_locator
 *       }
 *     },
 *     message, recordTime
 *   }
 *
 * Channel avatar isn't in this response — the caller falls back to
 * one `x/web-interface/view` call on the newest bvid to backfill it.
 * Items also carry a very large `uri` field we never need; the mapper
 * ignores it and the dev script strips it before printing the raw.
 */

const JUSTONEAPI_BASE_URL = 'https://api.justoneapi.com';
const USER_VIDEO_LIST_V2_PATH = '/api/bilibili/get-user-video-list/v2';

/** Platform-neutral video shape we emit from the mapper. */
export interface JustOneApiVideo {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: Date | null;
  durationSeconds: number | null;
}

export interface JustOneApiChannel {
  /** Numeric mid as a string. Falls back to the caller-provided value
   *  since the response envelope doesn't carry a mid field. */
  mid: string;
  /** Uploader's display name — sourced from `item[0].author`. Null
   *  when the response has no items. */
  name: string | null;
  /** Avatar URL. Not present in this response; channelSnapshot
   *  backfills it via one x/web-interface/view call on the newest
   *  bvid. Always null here. */
  logoUrl: string | null;
}

export interface JustOneApiChannelResult {
  channel: JustOneApiChannel;
  videos: JustOneApiVideo[];
  /**
   * Raw response envelope. Exposed so the dev script can dump it and
   * so Vercel logs have the upstream payload on failures without a
   * second round-trip. Large `uri` fields on each item are NOT
   * stripped here — callers that print this should do their own
   * pruning (see scripts/fetchBilibiliChannelViaJustOneApi.ts).
   */
  raw: unknown;
}

export class JustOneApiError extends Error {
  readonly code: number;
  readonly status: number | undefined;
  /** True for transient server-side issues (301/302/500) where a
   *  retry might succeed. False for permanent errors (100/400/600/
   *  601) where no retry helps. */
  readonly transient: boolean;

  constructor(message: string, opts: { code: number; status?: number; transient: boolean }) {
    super(message);
    this.name = 'JustOneApiError';
    this.code = opts.code;
    this.status = opts.status;
    this.transient = opts.transient;
    Object.setPrototypeOf(this, JustOneApiError.prototype);
  }
}

function classifyCode(code: number): boolean {
  // 301=collection failed retry, 302=rate limit, 500=internal.
  // Treat these as transient; the rest as permanent.
  return code === 301 || code === 302 || code === 500;
}

function getToken(): string {
  const token = process.env.JUSTONEAPI_TOKEN;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error(
      'JUSTONEAPI_TOKEN is not set. Add it to .env.local (dev) or Vercel env (prod).'
    );
  }
  return token;
}

/**
 * Fetch the user's channel + uploaded-video list through JustOneAPI.
 * Single page, as JustOneAPI returns. No retry — callers handle.
 */
export async function fetchBilibiliChannelViaJustOneApi(
  mid: string
): Promise<JustOneApiChannelResult> {
  const token = getToken();
  const url = `${JUSTONEAPI_BASE_URL}${USER_VIDEO_LIST_V2_PATH}?token=${encodeURIComponent(token)}&uid=${encodeURIComponent(mid)}`;
  const redactedUrl = url.replace(/token=[^&]+/, 'token=<redacted>');
  console.info(`[bilibili/justOneApi] GET ${redactedUrl}`);

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new JustOneApiError(`JustOneAPI HTTP ${res.status}: ${body.slice(0, 200)}`, {
      code: -1,
      status: res.status,
      transient: res.status >= 500,
    });
  }

  const json = (await res.json()) as Record<string, unknown>;
  const outerCode = typeof json.code === 'number' ? json.code : -1;
  if (outerCode !== 0) {
    const msg =
      typeof json.msg === 'string'
        ? json.msg
        : typeof json.message === 'string'
          ? json.message
          : '';
    throw new JustOneApiError(`JustOneAPI code=${outerCode} msg=${msg}`, {
      code: outerCode,
      status: res.status,
      transient: classifyCode(outerCode),
    });
  }

  return parseResponse(mid, json);
}

// ─── Mapper ─────────────────────────────────────────────────────────

interface RawItem {
  bvid?: unknown;
  title?: unknown;
  subtitle?: unknown;
  cover?: unknown;
  duration?: unknown;
  ctime?: unknown;
  author?: unknown;
}

/** Internal: produce the result shape from the decoded response body. */
export function parseResponse(mid: string, body: Record<string, unknown>): JustOneApiChannelResult {
  const items = extractItems(body);
  const videos: JustOneApiVideo[] = [];
  for (const item of items) {
    const v = mapVideoItem(item);
    if (v != null) {
      videos.push(v);
    }
  }

  const firstAuthor =
    items.length > 0 && typeof items[0].author === 'string' && items[0].author.length > 0
      ? (items[0].author as string)
      : null;

  return {
    channel: {
      mid,
      name: firstAuthor,
      logoUrl: null,
    },
    videos,
    raw: body,
  };
}

/**
 * The response is double-wrapped: JustOneAPI's outer envelope forwards
 * Bilibili's inner envelope verbatim. The actual list lives at
 * `body.data.data.item`. We accept a couple of shallower paths too
 * in case JustOneAPI ever flattens — makes the mapper robust without
 * full recursive probing.
 */
function extractItems(body: Record<string, unknown>): RawItem[] {
  const candidates: unknown[] = [
    (body?.data as Record<string, unknown> | undefined)?.data,
    body?.data,
    body,
  ];
  for (const node of candidates) {
    if (node != null && typeof node === 'object') {
      const item = (node as Record<string, unknown>).item;
      if (Array.isArray(item)) {
        return item.filter((x): x is RawItem => typeof x === 'object' && x !== null);
      }
    }
  }
  return [];
}

function mapVideoItem(item: RawItem): JustOneApiVideo | null {
  const bvid = typeof item.bvid === 'string' && item.bvid.length > 0 ? item.bvid : null;
  const title = typeof item.title === 'string' && item.title.length > 0 ? item.title : null;
  if (bvid == null || title == null) {
    return null;
  }
  return {
    videoId: bvid,
    title,
    description: typeof item.subtitle === 'string' ? item.subtitle : '',
    thumbnailUrl: normalizeThumbnail(typeof item.cover === 'string' ? item.cover : null),
    publishedAt:
      typeof item.ctime === 'number' && item.ctime > 0 ? new Date(item.ctime * 1000) : null,
    durationSeconds:
      typeof item.duration === 'number' && item.duration > 0 ? Math.floor(item.duration) : null,
  };
}

/**
 * Bilibili's CDN (i0/i1/i2.hdslb.com) returns HTTP 403 over HTTPS for
 * certain endpoints (observed on `/bfs/face/`). Keep Bilibili image
 * URLs on `http://` so they load directly — callers must also set
 * `referrerPolicy="no-referrer"` on the <img> element to dodge
 * hdslb's hotlink protection. Protocol-relative URLs get an `http:`
 * prefix, https URLs are downgraded, everything else passes through.
 */
export function normalizeThumbnail(raw: string | null): string {
  if (raw == null || raw.length === 0) {
    return '';
  }
  if (raw.startsWith('//')) {
    return `http:${raw}`;
  }
  if (raw.startsWith('https://')) {
    return `http://${raw.slice('https://'.length)}`;
  }
  return raw;
}
