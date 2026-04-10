const YT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface ScrapedVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date;
}

export interface ScrapedChannel {
  channelId: string;
  name: string;
  videos: ScrapedVideo[];
}

/**
 * Parses relative time text ("2w ago", "3mo ago", "1y ago") into an approximate Date.
 * Falls back to now if the format is unrecognized.
 */
function parseRelativeTime(text: string | undefined): Date {
  if (!text) {
    return new Date();
  }

  const match = text.match(
    /(\d+)\s*(second|minute|hour|day|week|month|year|mo|yr|wk|hr|min|sec)s?\s*ago/i
  );
  if (!match) {
    return new Date();
  }

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const now = new Date();

  switch (unit) {
    case 'second':
    case 'sec':
      now.setSeconds(now.getSeconds() - amount);
      break;
    case 'minute':
    case 'min':
      now.setMinutes(now.getMinutes() - amount);
      break;
    case 'hour':
    case 'hr':
      now.setHours(now.getHours() - amount);
      break;
    case 'day':
      now.setDate(now.getDate() - amount);
      break;
    case 'week':
    case 'wk':
      now.setDate(now.getDate() - amount * 7);
      break;
    case 'month':
    case 'mo':
      now.setMonth(now.getMonth() - amount);
      break;
    case 'year':
    case 'yr':
      now.setFullYear(now.getFullYear() - amount);
      break;
  }

  return now;
}

/**
 * Fetches a YouTube channel's Videos tab and extracts the channel ID, name,
 * and most recent uploads from the embedded ytInitialData JSON. No API key
 * required.
 *
 * We deliberately fetch the `/videos` sub-path rather than the channel root
 * because the channel root (Home tab) only exposes curated/featured shelves
 * (Popular, Interviews, Featured Video) — not chronological uploads. The
 * Videos tab returns the latest uploads in published-at-descending order via
 * a richGridRenderer, which is what we need for the inbox + the
 * `recent_n_new` initial subscription mode.
 *
 * Accepts either a /@handle or /channel/UCxxx URL path.
 */
export async function scrapeChannel(channelUrl: string): Promise<ScrapedChannel> {
  const videosUrl = channelUrl.replace(/\/+$/, '').endsWith('/videos')
    ? channelUrl
    : `${channelUrl.replace(/\/+$/, '')}/videos`;

  const response = await fetch(videosUrl, {
    headers: { 'User-Agent': YT_USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch channel page: ${response.status}`);
  }

  const html = await response.text();

  // Extract channel ID from the RSS <link> tag
  const channelIdMatch = html.match(/feeds\/videos\.xml\?channel_id=(UC[\w-]{20,})/);
  if (!channelIdMatch) {
    throw new Error('Could not find channel ID in page');
  }
  const channelId = channelIdMatch[1];

  // Extract channel name from og:title
  const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  const name = nameMatch ? nameMatch[1] : 'Unknown Channel';

  // Extract ytInitialData JSON
  const dataMatch = html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/);
  if (!dataMatch) {
    // Return channel info without videos if ytInitialData is missing
    return { channelId, name, videos: [] };
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(dataMatch[1]) as Record<string, unknown>;
  } catch {
    return { channelId, name, videos: [] };
  }

  const videos = extractVideosFromInitialData(data);
  return { channelId, name, videos };
}

type YtData = Record<string, unknown>;

const MAX_VIDEOS = 15;

/**
 * Walks the selected tab's `richGridRenderer.contents` array. When we fetch
 * `/videos`, the Videos tab is the selected tab, and its rich grid contains
 * the channel's uploads in chronological (newest-first) order, each wrapped
 * as `richItemRenderer.content.videoRenderer`.
 */
function extractVideosFromInitialData(data: YtData): ScrapedVideo[] {
  const tabs = ((data.contents as YtData)?.twoColumnBrowseResultsRenderer as YtData)?.tabs as
    | YtData[]
    | undefined;
  if (!tabs) {
    return [];
  }

  // Find the tab YouTube marked as selected. Since we fetched /videos, this
  // is the Videos tab. Falls back to a title match if `selected` is missing.
  const selectedTab = tabs.find((tab) => {
    const renderer = (tab as YtData).tabRenderer as YtData | undefined;
    if (renderer == null) {
      return false;
    }
    if (renderer.selected === true) {
      return true;
    }
    return renderer.title === 'Videos';
  });
  if (selectedTab == null) {
    return [];
  }

  const richGridContents = (((selectedTab as YtData).tabRenderer as YtData)?.content as YtData)
    ?.richGridRenderer as YtData | undefined;
  const items = (richGridContents?.contents as YtData[]) ?? [];

  const videos: ScrapedVideo[] = [];
  for (const item of items) {
    if (videos.length >= MAX_VIDEOS) {
      break;
    }
    const richItem = (item as YtData).richItemRenderer as YtData | undefined;
    const v = (richItem?.content as YtData)?.videoRenderer as YtData | undefined;
    if (v?.videoId == null) {
      // Skip continuationItemRenderer, ad slots, etc.
      continue;
    }

    const videoId = v.videoId as string;

    const titleRuns = (v.title as YtData)?.runs as YtData[] | undefined;
    const titleSimple = (v.title as YtData)?.simpleText as string | undefined;
    const title = (titleRuns?.[0]?.text as string) ?? titleSimple ?? '';

    const descSnippetRuns = (v.descriptionSnippet as YtData)?.runs as YtData[] | undefined;
    const description = descSnippetRuns?.map((r) => r.text as string).join('') ?? '';

    const publishedText = (v.publishedTimeText as YtData)?.simpleText as string | undefined;

    videos.push({
      videoId,
      title,
      description,
      publishedAt: parseRelativeTime(publishedText),
    });
  }

  return videos;
}
