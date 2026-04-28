import { UNKNOWN_CHANNEL_NAME, UNKNOWN_VIDEO_TITLE } from './constants';

const YT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface ScrapedVideo {
  videoId: string;
  title: string;
  description: string;
  /** Null when the channel page's relative-time text ("2w ago") is
   *  missing or unparseable. The scrape used to synthesize `new Date()`
   *  here, which is indistinguishable from a real timestamp — we now
   *  prefer null so the database layer can decide whether to record
   *  it or backfill from a later source. */
  publishedAt: Date | null;
  /** Length of the video in seconds, or null if the scraped data
   *  didn't include a parseable lengthText (Shorts, ad slots, etc.). */
  durationSeconds: number | null;
}

export interface ScrapedChannel {
  channelId: string;
  name: string;
  /** Channel avatar/logo URL extracted from the page's og:image meta
   *  tag. Typically a 900x900 hosted on yt3.googleusercontent.com.
   *  Null if the meta tag is missing. */
  logoUrl: string | null;
  /** Channel handle like `@mkbhd`, extracted from the page's
   *  canonical `<link>` tag. Null for channels without a handle (or
   *  when YouTube returns a `/channel/UCxxx` canonical instead). */
  handle: string | null;
  videos: ScrapedVideo[];
}

/**
 * Parses relative time text ("2w ago", "3mo ago", "1y ago") into an
 * approximate Date. Returns null when the input is missing or the
 * format is unrecognized — callers decide how to handle an unknown
 * timestamp (typically: store null in the DB).
 */
function parseRelativeTime(text: string | undefined): Date | null {
  if (!text) {
    return null;
  }

  const match = text.match(
    /(\d+)\s*(second|minute|hour|day|week|month|year|mo|yr|wk|hr|min|sec)s?\s*ago/i
  );
  if (!match) {
    return null;
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
 * Parse YouTube's lengthText.simpleText (e.g. "12:34", "1:02:03", "0:42")
 * into total seconds. Returns null if the input is null/undefined/empty
 * or doesn't match the expected colon-separated digits shape — better
 * to skip than to write a bogus duration.
 */
export function parseDurationText(text: string | null | undefined): number | null {
  if (text == null) {
    return null;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }
  let total = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    total = total * 60 + parseInt(part, 10);
  }
  return total;
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
    // See channelRss.ts for why we opt out of Next.js's fetch cache
    // here — this runs inside a workflow step, not a request.
    cache: 'no-store',
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
  const name = nameMatch ? nameMatch[1] : UNKNOWN_CHANNEL_NAME;

  // Extract channel avatar from og:image — YouTube sets this to the
  // channel's profile picture on the /videos tab page.
  const logoMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
  const logoUrl = logoMatch ? logoMatch[1] : null;

  // Extract the @handle from the `vanityChannelUrl` JSON field that
  // YouTube embeds in the page. Both `<link rel="canonical">` and
  // `<meta property="og:url">` resolve to the `/channel/UCxxx` form
  // even for channels that have a handle, so neither of those works.
  // The vanity URL is populated only for channels with a handle, so a
  // missing match legitimately means "no handle". YouTube emits the
  // URL as `http://` (not `https://`) — match it literally.
  const handleMatch = html.match(
    /"vanityChannelUrl":"https?:\\?\/\\?\/www\.youtube\.com\/@([\w.-]+)"/
  );
  const handle = handleMatch ? `@${handleMatch[1]}` : null;

  // Extract ytInitialData JSON
  const dataMatch = html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/);
  if (!dataMatch) {
    // Return channel info without videos if ytInitialData is missing
    return { channelId, name, logoUrl, handle, videos: [] };
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(dataMatch[1]) as Record<string, unknown>;
  } catch {
    return { channelId, name, logoUrl, handle, videos: [] };
  }

  const videos = extractVideosFromInitialData(data);
  return { channelId, name, logoUrl, handle, videos };
}

type YtData = Record<string, unknown>;

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
    const richItem = (item as YtData).richItemRenderer as YtData | undefined;
    const v = (richItem?.content as YtData)?.videoRenderer as YtData | undefined;
    if (v?.videoId == null) {
      // Skip continuationItemRenderer, ad slots, etc.
      continue;
    }

    // Scheduled livestreams and unaired premieres carry an
    // `upcomingEventData` block with a future `startTime`. Pulling
    // them in would only burn a transcript fetch that's guaranteed
    // to 404 — and worse, the sticky `transcript_unavailable` flag
    // would then block re-fetching after the stream actually airs.
    if (v.upcomingEventData != null) {
      continue;
    }

    const videoId = v.videoId as string;

    const titleRuns = (v.title as YtData)?.runs as YtData[] | undefined;
    const titleSimple = (v.title as YtData)?.simpleText as string | undefined;
    const title = (titleRuns?.[0]?.text as string) ?? titleSimple ?? UNKNOWN_VIDEO_TITLE;

    const descSnippetRuns = (v.descriptionSnippet as YtData)?.runs as YtData[] | undefined;
    const description = descSnippetRuns?.map((r) => r.text as string).join('') ?? '';

    const publishedText = (v.publishedTimeText as YtData)?.simpleText as string | undefined;

    // YouTube exposes the duration as `videoRenderer.lengthText.simpleText`
    // ("12:34"). The shorts shelf path uses a different shape and may
    // omit it entirely — fall through to null in that case.
    const lengthText = (v.lengthText as YtData)?.simpleText as string | undefined;

    videos.push({
      videoId,
      title,
      description,
      publishedAt: parseRelativeTime(publishedText),
      durationSeconds: parseDurationText(lengthText),
    });
  }

  return videos;
}
