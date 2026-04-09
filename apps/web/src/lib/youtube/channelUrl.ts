/**
 * Extracts a UC... channel ID from a direct channel URL or bare ID.
 * Returns null for /@handle URLs (use resolveHandleToChannelId for those).
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
    const match = url.pathname.match(/^\/@([\w.-]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Fetches a YouTube /@handle page and extracts the UC... channel ID from the
 * RSS <link> tag in the page's <head>. No API key required.
 */
export async function resolveHandleToChannelId(handle: string): Promise<string | null> {
  const response = await fetch(`https://www.youtube.com/@${handle}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ReadTube/1.0; +https://readtube.app)',
    },
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();

  // YouTube includes this in <head>:
  // <link rel="alternate" type="application/rss+xml" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCxxx">
  const rssMatch = html.match(/feeds\/videos\.xml\?channel_id=(UC[\w-]{20,})/);
  return rssMatch ? rssMatch[1] : null;
}

export function buildRssUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}
