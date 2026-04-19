/**
 * Fetch a Bilibili user's upload list via the signed JSON endpoint
 * `api.bilibili.com/x/space/wbi/arc/search`. Replaces the earlier
 * Puppeteer scrape of `space.bilibili.com/<mid>/upload/video` which
 * was flaky on Vercel (Lambda IP + SPA hydration race).
 *
 * No auth needed for public channels — only the WBI query signature,
 * which `signWbi` handles.
 */
import { getBilibiliAntiBotCookie, signWbi } from './wbi';

const BILIBILI_ARC_SEARCH_URL = 'https://api.bilibili.com/x/space/wbi/arc/search';

const BILIBILI_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

// "DM" (device-monitor) params added by Bilibili ~mid-2024 on signed
// wbi endpoints. They simulate a browser's canvas/WebGL fingerprint.
// These static values match what a real Chrome sends and are accepted
// by api.bilibili.com; without them, `wbi/arc/search` returns
// `code=-352 风控校验失败` even on a cookie-primed session. Sent as
// plain query params so they're included in the WBI signature.
const DM_IMG_LIST = '[]';
const DM_IMG_STR = 'V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4w';
const DM_COVER_IMG_STR =
  'QU5HTEUgKEFwcGxlLCBBTkdMRSBNZXRhbCBSZW5kZXJlcjogQXBwbGUgTTEgUHJvLCBVbnNwZWNpZmllZCBWZXJzaW9uKUdvb2dsZSBJbmMuIChBcHBsZSk';
const DM_IMG_INTER = '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}';

export interface BilibiliChannelVideo {
  /** BV id. */
  videoId: string;
  title: string;
  /** Short summary from the list view — may be truncated. Full
   *  description lives on the per-video `view` endpoint if needed. */
  description: string;
  /** Normalized to https://. The API returns protocol-relative URLs. */
  thumbnailUrl: string;
  /** Null if `created` is missing or zero. */
  publishedAt: Date | null;
  /** Parsed from the `length` string ("M:SS" or "H:MM:SS"). Null if
   *  missing or unparseable. */
  durationSeconds: number | null;
}

interface ArcSearchItem {
  bvid?: string;
  title?: string;
  description?: string;
  pic?: string;
  created?: number;
  length?: string;
}

interface ArcSearchResponse {
  code: number;
  message: string;
  data?: {
    list?: {
      vlist?: ArcSearchItem[];
    };
    page?: {
      count?: number;
      pn?: number;
      ps?: number;
    };
  };
}

/**
 * Fetch the newest-first page of a Bilibili user's uploads. Does not
 * paginate — we only ever return page 1, using Bilibili's own default
 * page size (omitting `ps` from the signed query makes the request
 * look like a first-load from the space page).
 *
 * Ordering: `order=pubdate` returns publication-date descending, which
 * matches what the frontend shows by default and what the
 * refresh-channels cron expects.
 */
export async function fetchBilibiliChannelVideos(mid: string): Promise<BilibiliChannelVideo[]> {
  const [signed, cookieHeader] = await Promise.all([
    signWbi({
      mid,
      pn: 1,
      order: 'pubdate',
      platform: 'web',
      web_location: '1550101',
      dm_img_list: DM_IMG_LIST,
      dm_img_str: DM_IMG_STR,
      dm_cover_img_str: DM_COVER_IMG_STR,
      dm_img_inter: DM_IMG_INTER,
    }),
    getBilibiliAntiBotCookie(),
  ]);

  const url = `${BILIBILI_ARC_SEARCH_URL}?${new URLSearchParams(signed).toString()}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': BILIBILI_USER_AGENT,
      Referer: 'https://www.bilibili.com/',
      Cookie: cookieHeader,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bilibili arc/search returned HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as ArcSearchResponse;
  if (json.code !== 0) {
    throw new Error(`Bilibili arc/search error: code=${json.code} message=${json.message}`);
  }

  const items = json.data?.list?.vlist ?? [];
  return items
    .filter((it): it is ArcSearchItem & { bvid: string; title: string } => {
      return typeof it.bvid === 'string' && typeof it.title === 'string';
    })
    .map(mapItem);
}

function mapItem(item: ArcSearchItem & { bvid: string; title: string }): BilibiliChannelVideo {
  return {
    videoId: item.bvid,
    title: item.title,
    description: typeof item.description === 'string' ? item.description : '',
    thumbnailUrl: normalizeThumbnailUrl(item.pic),
    publishedAt:
      typeof item.created === 'number' && item.created > 0 ? new Date(item.created * 1000) : null,
    durationSeconds: parseDuration(item.length),
  };
}

/**
 * Bilibili serves thumbnails as protocol-relative URLs
 * (`//i0.hdslb.com/...`). Normalize to `https://` so the DB stores
 * a URL the <img> tag can load on every origin.
 */
export function normalizeThumbnailUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) {
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
 * Parse a Bilibili duration string into seconds. Formats seen:
 *   - "5:23"       → 323
 *   - "1:02:30"    → 3750
 *   - "00:45"      → 45
 * Returns null for empty/missing/unparseable input.
 */
export function parseDuration(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }
  const parts = raw.split(':');
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }
  const nums = parts.map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n) || n < 0)) {
    return null;
  }
  if (nums.length === 2) {
    return nums[0] * 60 + nums[1];
  }
  return nums[0] * 3600 + nums[1] * 60 + nums[2];
}
