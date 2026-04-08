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
 * Fetches a YouTube channel page and extracts the channel ID, name, and
 * recent videos from the embedded ytInitialData JSON. No API key required.
 *
 * Accepts either a /@handle or /channel/UCxxx URL path.
 */
export async function scrapeChannel(channelUrl: string): Promise<ScrapedChannel> {
  const response = await fetch(channelUrl, {
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

function extractVideosFromInitialData(data: YtData): ScrapedVideo[] {
  const tabs = ((data.contents as YtData)?.twoColumnBrowseResultsRenderer as YtData)?.tabs as
    | YtData[]
    | undefined;

  if (!tabs) {
    return [];
  }

  const seen = new Set<string>();
  const videos: ScrapedVideo[] = [];

  // Walk the Home tab's sections to find all video renderers
  const homeTab = tabs[0];
  const sections = (((homeTab as YtData)?.tabRenderer as YtData)?.content as YtData)
    ?.sectionListRenderer as YtData;
  const contents = (sections?.contents as YtData[]) ?? [];

  for (const section of contents) {
    const sectionContents = ((section as YtData).itemSectionRenderer as YtData)
      ?.contents as YtData[];
    if (!sectionContents) {
      continue;
    }

    for (const renderer of sectionContents) {
      // Featured video at top of channel
      const featured = renderer.channelVideoPlayerRenderer as YtData | undefined;
      if (featured?.videoId) {
        const videoId = featured.videoId as string;
        if (!seen.has(videoId)) {
          seen.add(videoId);
          const titleRuns = (featured.title as YtData)?.runs as YtData[] | undefined;
          const descRuns = (featured.description as YtData)?.runs as YtData[] | undefined;
          videos.push({
            videoId,
            title: (titleRuns?.[0]?.text as string) ?? '',
            description: descRuns?.map((r) => r.text as string).join('') ?? '',
            publishedAt: parseRelativeTime(
              ((featured.publishedTimeText as YtData)?.runs as YtData[])?.[0]?.text as string
            ),
          });
        }
      }

      // Shelf sections (Interviews, Popular, etc.)
      const shelf = renderer.shelfRenderer as YtData | undefined;
      const items = ((shelf?.content as YtData)?.horizontalListRenderer as YtData)?.items as
        | YtData[]
        | undefined;
      if (items) {
        for (const item of items) {
          const v = item.gridVideoRenderer as YtData | undefined;
          if (!v?.videoId) {
            continue;
          }
          const videoId = v.videoId as string;
          if (seen.has(videoId)) {
            continue;
          }
          seen.add(videoId);
          videos.push({
            videoId,
            title:
              ((v.title as YtData)?.simpleText as string) ??
              (((v.title as YtData)?.runs as YtData[])?.[0]?.text as string) ??
              '',
            description: '',
            publishedAt: parseRelativeTime((v.publishedTimeText as YtData)?.simpleText as string),
          });
        }
      }
    }
  }

  // Sort by publishedAt descending, take most recent 15
  videos.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return videos.slice(0, 15);
}
