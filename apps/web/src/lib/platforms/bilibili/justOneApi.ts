/**
 * Third-party wrapper around Bilibili's channel / upload-list data.
 * We delegate the IP-reputation and WBI-risk-control problem to
 * justoneapi.com — they run their own collectors on residential
 * infrastructure and expose a simple token-auth HTTP API.
 *
 * Docs: https://docs.justoneapi.com/zh/api/bilibili/user-published-videos-v2
 *
 * Auth: `?token=<JUSTONEAPI_TOKEN>` query parameter.
 * Endpoint: `GET https://api.justoneapi.com/api/bilibili/get-user-video-list/v2`
 *
 * Response shape: `{ code, msg?, data: { ... } }`. The `code` ladder
 * is documented (0 success; 100 invalid token; 301 collection failed;
 * 302 rate limit; 303 daily quota; 400 bad param; 500 internal;
 * 600 permission; 601 insufficient balance) but the concrete video-
 * list field names aren't in the public docs — they're loaded by
 * client-side JS on the docs page. The mapper below tries the
 * typical Bilibili field-name shapes and logs the raw envelope so
 * the dev script can reveal the exact schema.
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
  /** Numeric mid as a string. Null if the response didn't expose it. */
  mid: string | null;
  name: string | null;
  logoUrl: string | null;
}

export interface JustOneApiChannelResult {
  channel: JustOneApiChannel;
  videos: JustOneApiVideo[];
  /**
   * Raw response envelope. Exposed so the dev script can dump it on
   * first run and we can narrow the mapper based on real field names.
   * Also useful for ad-hoc debugging in Vercel logs without needing
   * another round-trip.
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
  const code = typeof json.code === 'number' ? json.code : -1;
  if (code !== 0) {
    const msg =
      typeof json.msg === 'string'
        ? json.msg
        : typeof json.message === 'string'
          ? json.message
          : '';
    throw new JustOneApiError(`JustOneAPI code=${code} msg=${msg}`, {
      code,
      status: res.status,
      transient: classifyCode(code),
    });
  }

  return parseResponse(mid, json);
}

// ─── Mapper: tolerant extraction from the unspecified envelope ────

/** Internal: produce the result shape from the decoded response body. */
export function parseResponse(mid: string, body: Record<string, unknown>): JustOneApiChannelResult {
  const data = isObject(body.data) ? body.data : body;

  const videoList = findVideoArray(data);
  const channel = findChannelInfo(data, videoList[0] ?? null);

  return {
    channel: {
      mid: channel.mid ?? mid,
      name: channel.name,
      logoUrl: channel.logoUrl,
    },
    videos: videoList.map(mapVideoItem).filter((v): v is JustOneApiVideo => v !== null),
    raw: body,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Recursively walk the response data looking for the first array
 * whose elements look like video items (have a `bvid`/`bv_id`/`aid`
 * or something titled). The docs don't name the key, so we probe.
 */
function findVideoArray(root: unknown): Record<string, unknown>[] {
  const candidates = [
    'videos',
    'list',
    'vlist',
    'items',
    'data',
    'video_list',
    'video',
    'published',
  ];

  const walkQueue: unknown[] = [root];
  const seen = new Set<unknown>();
  while (walkQueue.length > 0) {
    const node = walkQueue.shift();
    if (!isObject(node) || seen.has(node)) {
      continue;
    }
    seen.add(node);
    for (const key of candidates) {
      const v = node[key];
      if (Array.isArray(v) && v.length > 0 && isObject(v[0]) && looksLikeVideo(v[0])) {
        return v.filter(isObject);
      }
    }
    for (const v of Object.values(node)) {
      if (isObject(v)) {
        walkQueue.push(v);
      } else if (Array.isArray(v) && v.length > 0 && isObject(v[0]) && looksLikeVideo(v[0])) {
        return v.filter(isObject);
      }
    }
  }
  return [];
}

function looksLikeVideo(item: Record<string, unknown>): boolean {
  return (
    typeof item.bvid === 'string' ||
    typeof item.bv_id === 'string' ||
    (typeof item.title === 'string' &&
      (typeof item.pic === 'string' ||
        typeof item.cover === 'string' ||
        typeof item.thumbnail === 'string'))
  );
}

function findChannelInfo(
  data: Record<string, unknown>,
  firstVideo: Record<string, unknown> | null
): JustOneApiChannel {
  // First try top-level channel/user blocks on the root `data`.
  const directContainers = ['user', 'channel', 'owner', 'author', 'up', 'info'];
  for (const key of directContainers) {
    const block = data[key];
    if (isObject(block)) {
      const info = extractChannelFromBlock(block);
      if (info.name != null || info.logoUrl != null || info.mid != null) {
        return info;
      }
    }
  }
  // Fall back to inline owner info on the first video.
  if (firstVideo != null) {
    const ownerBlocks = ['owner', 'user', 'author', 'up'];
    for (const key of ownerBlocks) {
      const block = firstVideo[key];
      if (isObject(block)) {
        const info = extractChannelFromBlock(block);
        if (info.name != null || info.logoUrl != null) {
          return info;
        }
      }
    }
    // Or flat fields on the video itself.
    return extractChannelFromBlock(firstVideo);
  }
  return { mid: null, name: null, logoUrl: null };
}

function extractChannelFromBlock(block: Record<string, unknown>): JustOneApiChannel {
  return {
    mid: pickString(block, ['mid', 'uid', 'user_id', 'id']),
    name: pickString(block, ['name', 'uname', 'nickname', 'author', 'mid_name']),
    logoUrl: pickString(block, ['face', 'avatar', 'logo', 'mid_face', 'cover']),
  };
}

function mapVideoItem(item: Record<string, unknown>): JustOneApiVideo | null {
  const videoId = pickString(item, ['bvid', 'bv_id', 'id', 'video_id']);
  const title = pickString(item, ['title', 'name']);
  if (videoId == null || title == null) {
    return null;
  }
  return {
    videoId,
    title,
    description: pickString(item, ['description', 'desc', 'summary', 'intro']) ?? '',
    thumbnailUrl: normalizeThumbnail(
      pickString(item, ['pic', 'cover', 'thumbnail', 'cover_url', 'image'])
    ),
    publishedAt: parseTimestamp(
      pickNumber(item, [
        'created',
        'pub_time',
        'publish_time',
        'pubdate',
        'created_at',
        'timestamp',
      ]) ?? pickString(item, ['publish_time', 'created_at', 'pubdate'])
    ),
    durationSeconds: parseDurationSeconds(
      pickNumber(item, ['duration']) ?? pickString(item, ['length', 'duration'])
    ),
  };
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) {
      return v;
    }
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      return v;
    }
  }
  return null;
}

function normalizeThumbnail(raw: string | null): string {
  if (raw == null || raw.length === 0) {
    return '';
  }
  if (raw.startsWith('//')) {
    return `https:${raw}`;
  }
  if (raw.startsWith('http://')) {
    return `https://${raw.slice('http://'.length)}`;
  }
  return raw;
}

/**
 * Accept seconds (10-digit int), milliseconds (13-digit int), ISO
 * string, or null. Everything else → null.
 */
export function parseTimestamp(raw: number | string | null): Date | null {
  if (raw == null) {
    return null;
  }
  if (typeof raw === 'number') {
    if (raw <= 0) {
      return null;
    }
    // < 10^12 → seconds; ≥ 10^12 → milliseconds.
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isNaN(n) && String(n) === raw.trim()) {
    return parseTimestamp(n);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Duration as either a pre-parsed number of seconds, or an "M:SS"/
 * "H:MM:SS" string. Null on unparseable.
 */
export function parseDurationSeconds(raw: number | string | null): number | null {
  if (raw == null) {
    return null;
  }
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const asInt = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(asInt) && String(asInt) === trimmed) {
    return asInt > 0 ? asInt : null;
  }
  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }
  const nums = parts.map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n) || n < 0)) {
    return null;
  }
  return nums.length === 2 ? nums[0] * 60 + nums[1] : nums[0] * 3600 + nums[1] * 60 + nums[2];
}
