/**
 * Resolves a YouTube channel URL or ID to a channelId (UC... format).
 *
 * Supported formats:
 *   - https://youtube.com/channel/UCxxx
 *   - UCxxx (bare channel ID)
 *
 * /@handle format requires an API call to resolve — not supported in v1.
 * Returns null for unsupported or invalid inputs.
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

    // /@handle — not supported in v1, needs YouTube Data API resolution
    if (url.pathname.startsWith('/@')) {
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

export function buildRssUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}
