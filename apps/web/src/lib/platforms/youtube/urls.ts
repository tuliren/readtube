/**
 * URL builders and extractors for YouTube channels, videos, and
 * avatar images. These are pure, synchronous helpers — no network
 * I/O. Helpers that *fetch* channel data live in their own
 * source-specific files:
 *
 *   - channelScrape.ts  → scrape the channel /videos HTML page
 *   - channelRss.ts     → fetch YouTube's native RSS feed
 *   - transcriptApi.ts  → call TranscriptAPI's /channel/latest
 */

/** Shape of a YouTube video id: 11 URL-safe chars (A-Z, a-z, 0-9,
 *  underscore, hyphen). Single source of truth reused by URL parsing,
 *  `YouTubePlatform.matchesUrl`, and `YouTubePlatform.matchesSourceId`. */
export const YOUTUBE_VIDEO_ID_PATTERN = /^[\w-]{11}$/;

// ─── Channel URL parsing ────────────────────────────────────────

/**
 * Extracts a UC... channel ID from a direct channel URL or bare ID.
 * Returns null for /@handle URLs — use `extractHandle` for those.
 */
export function extractChannelId(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();

  // Bare channel ID: starts with UC and is ~24 chars
  if (/^UC[\w-]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);

    if (!url.hostname.includes('youtube.com')) {
      return null;
    }

    // https://youtube.com/channel/UCxxx
    const channelMatch = url.pathname.match(/^\/channel\/(UC[\w-]{20,})/);
    if (channelMatch) {
      return channelMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Returns the handle (without @) if the input is a /@handle URL, else null.
 *
 * Handles non-ASCII characters: YouTube allows Unicode handles (Cyrillic,
 * CJK, etc.), and the URL constructor percent-encodes them in `pathname`,
 * so we decode before applying a Unicode-aware regex.
 */
export function extractHandle(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }
  try {
    const url = new URL(input.trim());
    if (!url.hostname.includes('youtube.com')) {
      return null;
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      // Malformed percent-encoding — leave as-is; the regex below
      // won't match `%` so we'll fall through to returning null.
      pathname = url.pathname;
    }
    // Constructed via `new RegExp` because the project's TS target
    // (es5) rejects the `u` flag on regex literals; the flag works
    // fine at runtime on every supported Node/browser version.
    const handleRegex = new RegExp('^/@([\\p{L}\\p{N}._-]+)', 'u');
    const match = pathname.match(handleRegex);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ─── Playlist URL parsing ────────────────────────────────────────

/**
 * Extracts a YouTube playlist ID from:
 *   - Bare playlist ID (starts with PL/UU/OL/LL/FL/RD etc., 10+ chars)
 *   - /playlist?list=PLxxx
 *   - /watch?v=...&list=PLxxx
 */
export function extractPlaylistId(input: string): string | null {
  if (input == null || typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Bare playlist ID
  if (/^[A-Z]{2}[\w-]{10,}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (!url.hostname.includes('youtube.com')) {
      return null;
    }
    const list = url.searchParams.get('list');
    if (list != null && /^[A-Z]{2}[\w-]{10,}$/.test(list)) {
      return list;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── URL builders ────────────────────────────────────────────────

/** Build the YouTube channel RSS feed URL from a UC-prefixed channel id. */
export function buildRssUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

/** Build the YouTube playlist RSS feed URL from a playlist ID. */
export function buildPlaylistRssUrl(playlistId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
}

/**
 * Construct a YouTube video thumbnail URL from the videoId. Always
 * available — doesn't require any API call. Uses `hqdefault.jpg`
 * (480x360) which is guaranteed to exist for all public videos.
 */
export function buildThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// ─── Avatar URL rewrite ──────────────────────────────────────────

/**
 * Resize a Google User Content avatar URL to a specific pixel size.
 *
 * YouTube channel avatars are hosted on yt3.googleusercontent.com and
 * come with a size parameter like `=s900-c-k-c0x00ffffff-no-rj`.
 * Loading a 900px image for a 20px sidebar avatar is wasteful — this
 * helper rewrites the `=s<N>` token to the requested dimension so the
 * CDN serves a pre-scaled version.
 *
 * If the URL doesn't match the Google User Content pattern (or has
 * no `=s<N>` token), returns the URL unchanged — better to show a
 * slightly-too-large image than nothing.
 */
export function resizeGoogleAvatar(url: string, size: number): string {
  // Match the =sNNN parameter anywhere in the URL's query/fragment,
  // including when it's followed by other dash-separated tokens.
  return url.replace(/=s\d+/, `=s${size}`);
}
