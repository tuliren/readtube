/**
 * URL/ID parsers for Bilibili. Pure sync helpers — no network I/O.
 * Counterpart to lib/youtube/urls.ts and videoSnapshot.ts.
 */

/** Shape of a Bilibili BV id: `BV` + 10 alphanumerics. Single source
 *  of truth reused by URL parsing, `BilibiliPlatform.matchesUrl`, and
 *  `BilibiliPlatform.matchesSourceId`. */
export const BVID_PATTERN = /^BV[A-Za-z0-9]{10}$/;

/**
 * Extracts a Bilibili video id (BVxxxxxxxxxx) from common URL shapes or
 * a bare BV id. Returns null on no match. `b23.tv` short links are not
 * parsed because they redirect through HTTP and this helper is sync —
 * callers can pre-resolve those if needed.
 */
export function extractBilibiliVideoId(input: string): string | null {
  if (input == null || typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (BVID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (!host.includes('bilibili.com')) {
      return null;
    }
    const match = url.pathname.match(/\/video\/(BV[A-Za-z0-9]{10})/);
    if (match != null) {
      return match[1];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Watch-page URL for a Bilibili video — used as the input to kedou's
 * subtitle extractor which requires a full URL.
 */
export function buildBilibiliVideoUrl(bvid: string): string {
  return `https://www.bilibili.com/video/${bvid}/`;
}

/**
 * Public "space" URL for a Bilibili user/channel by numeric mid. We
 * surface this in the UI as the channel link since there's no RSS
 * equivalent.
 */
export function buildBilibiliSpaceUrl(mid: string): string {
  return `https://space.bilibili.com/${mid}`;
}

/** Shape of a Bilibili numeric mid (user id). Min 4 digits keeps us
 *  well above accidental short strings but still covers every real
 *  uploader id. */
const BILIBILI_MID_PATTERN = /^\d{4,}$/;

/**
 * Extract a Bilibili user mid from a space URL or a bare numeric id.
 * Handles:
 *   - `https://space.bilibili.com/<mid>`
 *   - `https://space.bilibili.com/<mid>/upload/video` (+ other sub-paths)
 *   - bare numeric mid like `946974`
 * Returns null on no match.
 */
export function extractBilibiliChannelMid(input: string): string | null {
  if (input == null || typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (BILIBILI_MID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname.toLowerCase() !== 'space.bilibili.com') {
      return null;
    }
    const match = url.pathname.match(/^\/(\d{4,})(?:\/|$)/);
    return match != null ? match[1] : null;
  } catch {
    return null;
  }
}
