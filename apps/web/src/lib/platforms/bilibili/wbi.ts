import { createHash } from 'crypto';

/**
 * Bilibili's WBI signing scheme — the signature that `api.bilibili.com`
 * expects on most `wbi/*` endpoints. Rough sketch:
 *
 *   1. Fetch `img_url` + `sub_url` from `/x/web-interface/nav`; their
 *      basenames (stripped of extension) are `img_key` / `sub_key`.
 *   2. Concatenate and permute by a 64-index constant, take the first
 *      32 chars → `mixinKey`.
 *   3. For each request, add `wts = floor(now/1000)`, sort params
 *      alphabetically, url-encode (strip `!'()*` from values), and
 *      set `w_rid = md5(queryString + mixinKey)`.
 *
 * The mixin key rotates with Bilibili's image URLs; we cache ours in
 * module scope for 10 minutes. `signWbi` is the only exported surface —
 * callers hand in their params, get back a fully-signed record.
 */

const NAV_URL = 'https://api.bilibili.com/x/web-interface/nav';
const BUVID_URL = 'https://api.bilibili.com/x/frontend/finger/spi';
const HOMEPAGE_URL = 'https://www.bilibili.com/';

const BILIBILI_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

// Canonical 64-index permutation used to derive the mixin key from
// `img_key + sub_key`. Reference: widely documented in biliup-rs,
// bilibili-api-python, etc. Do not change.
const MIXIN_KEY_ENCODE_TABLE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28,
  14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54,
  21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

// Bilibili's own frontend strips these four characters from values
// before computing the signature. If we don't, signatures mismatch.
const FORBIDDEN_VALUE_CHARS = /[!'()*]/g;

const CACHE_TTL_MS = 10 * 60 * 1000;

interface NavResponse {
  code: number;
  data?: {
    wbi_img?: {
      img_url: string;
      sub_url: string;
    };
  };
}

interface CachedMixin {
  mixinKey: string;
  expiresAt: number;
}

interface CachedBuvid {
  cookieHeader: string;
  expiresAt: number;
}

let cachedMixin: CachedMixin | null = null;
let cachedBuvid: CachedBuvid | null = null;

/**
 * Pure helper — derives the 32-char mixin key from img/sub keys.
 * Exported so the unit test can exercise it against known inputs
 * without hitting the network.
 */
export function getMixinKey(imgKey: string, subKey: string): string {
  const combined = imgKey + subKey;
  let out = '';
  for (const idx of MIXIN_KEY_ENCODE_TABLE) {
    if (idx < combined.length) {
      out += combined[idx];
    }
    if (out.length === 32) {
      break;
    }
  }
  return out;
}

function extractKeyFromUrl(url: string): string {
  // e.g. "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png"
  // →    "7cd084941338484aae1ad9425b84077c"
  const basename = url.split('/').pop() ?? '';
  const dot = basename.lastIndexOf('.');
  return dot === -1 ? basename : basename.slice(0, dot);
}

async function fetchMixinKey(): Promise<string> {
  const res = await fetch(NAV_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': BILIBILI_USER_AGENT,
      Referer: 'https://www.bilibili.com/',
    },
  });
  if (!res.ok) {
    throw new Error(`Bilibili nav returned HTTP ${res.status}`);
  }
  const json = (await res.json()) as NavResponse;
  const wbi = json.data?.wbi_img;
  if (wbi == null || typeof wbi.img_url !== 'string' || typeof wbi.sub_url !== 'string') {
    throw new Error(`Bilibili nav response missing wbi_img (code=${json.code})`);
  }
  return getMixinKey(extractKeyFromUrl(wbi.img_url), extractKeyFromUrl(wbi.sub_url));
}

async function getCachedMixinKey(): Promise<string> {
  if (cachedMixin != null && cachedMixin.expiresAt > Date.now()) {
    return cachedMixin.mixinKey;
  }
  const mixinKey = await fetchMixinKey();
  cachedMixin = { mixinKey, expiresAt: Date.now() + CACHE_TTL_MS };
  return mixinKey;
}

interface BuvidResponse {
  code: number;
  data?: {
    b_3?: string;
    b_4?: string;
  };
}

/**
 * Fetch Bilibili's anti-bot cookies. Most signed `api.bilibili.com`
 * endpoints reply HTTP 412 or `code=-352` without a full browser-style
 * cookie jar — the WBI signature alone isn't enough. We prime cookies
 * from two sources and merge them:
 *
 *   1. `api.bilibili.com/x/frontend/finger/spi` → returns `b_3` (aka
 *      `buvid3`) and `b_4` (aka `buvid4`) in the JSON body.
 *   2. `www.bilibili.com/` homepage → its Set-Cookie response headers
 *      drop a larger set including `b_nut`, `_uuid`, `buvid_fp`, etc.
 *      These are the "real browser session" signals Bilibili's risk
 *      engine looks for.
 *
 * We generate `b_lsid` ourselves (random 8-hex + `_` + Date.now() in
 * hex) — this is what the frontend JS does.
 *
 * Cached for 10 min so repeated channel fetches don't spam either
 * endpoint.
 */
export async function getBilibiliAntiBotCookie(): Promise<string> {
  if (cachedBuvid != null && cachedBuvid.expiresAt > Date.now()) {
    return cachedBuvid.cookieHeader;
  }

  const cookies: Record<string, string> = {};

  // 1. finger/spi → buvid3/buvid4
  const fingerRes = await fetch(BUVID_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': BILIBILI_USER_AGENT,
      Referer: 'https://www.bilibili.com/',
    },
  });
  if (fingerRes.ok) {
    const json = (await fingerRes.json()) as BuvidResponse;
    if (typeof json.data?.b_3 === 'string' && json.data.b_3.length > 0) {
      cookies.buvid3 = json.data.b_3;
    }
    if (typeof json.data?.b_4 === 'string' && json.data.b_4.length > 0) {
      cookies.buvid4 = json.data.b_4;
    }
  }

  // 2. homepage → Set-Cookie (_uuid, b_nut, buvid_fp, ...)
  const homepageRes = await fetch(HOMEPAGE_URL, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': BILIBILI_USER_AGENT,
    },
    redirect: 'follow',
  });
  const setCookies = homepageRes.headers.getSetCookie?.() ?? [];
  for (const sc of setCookies) {
    const firstPair = sc.split(';', 1)[0];
    const eq = firstPair.indexOf('=');
    if (eq > 0) {
      const name = firstPair.slice(0, eq).trim();
      const value = firstPair.slice(eq + 1).trim();
      if (name.length > 0 && value.length > 0) {
        cookies[name] = value;
      }
    }
  }

  // 3. b_lsid — generated client-side by Bilibili's JS. Pattern is
  //    <random 8 hex chars>_<Date.now() in hex uppercase>.
  const randomHex = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .toUpperCase()
    .padStart(8, '0');
  const tsHex = Date.now().toString(16).toUpperCase();
  cookies.b_lsid = `${randomHex}_${tsHex}`;

  // 4. buvid_fp — frontend computes this as a fingerprint hash. The
  //    MD5 of buvid3 is a common third-party-lib approximation that
  //    Bilibili's risk engine accepts for low-trust sessions.
  if (cookies.buvid3 != null) {
    cookies.buvid_fp = createHash('md5').update(cookies.buvid3).digest('hex');
  }

  if (Object.keys(cookies).length === 0) {
    throw new Error('Bilibili cookie priming produced no cookies');
  }

  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  cachedBuvid = { cookieHeader, expiresAt: Date.now() + CACHE_TTL_MS };
  return cookieHeader;
}

/**
 * Sign a query parameter set. Returns a new record with `wts` + `w_rid`
 * appended, all values stringified. The input is left untouched.
 *
 * @param mixinKeyOverride — for tests; pins the mixin key so the
 *   signature is deterministic without network.
 * @param nowSeconds — for tests; pins `wts` so signatures are stable.
 */
export async function signWbi(
  params: Record<string, string | number>,
  opts: { mixinKeyOverride?: string; nowSeconds?: number } = {}
): Promise<Record<string, string>> {
  const mixinKey = opts.mixinKeyOverride ?? (await getCachedMixinKey());
  const wts = opts.nowSeconds ?? Math.floor(Date.now() / 1000);

  const withWts: Record<string, string> = { wts: String(wts) };
  for (const [k, v] of Object.entries(params)) {
    withWts[k] = String(v).replace(FORBIDDEN_VALUE_CHARS, '');
  }

  const sortedKeys = Object.keys(withWts).sort();
  const sp = new URLSearchParams();
  for (const k of sortedKeys) {
    sp.append(k, withWts[k]);
  }
  const w_rid = createHash('md5')
    .update(sp.toString() + mixinKey)
    .digest('hex');

  return { ...withWts, w_rid };
}

/**
 * Test-only: reset the module-scope cache so tests don't leak state.
 */
export function __resetWbiCacheForTests(): void {
  cachedMixin = null;
  cachedBuvid = null;
}
