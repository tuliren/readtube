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
  /** Video ids the channel-page scrape identified as scheduled
   *  premieres / upcoming livestreams (entries carrying
   *  `upcomingEventData`). These are intentionally absent from
   *  `videos` — surfaced separately so `mergeSnapshot` can drop them
   *  from the RSS-derived list as well. RSS reports the upload time
   *  rather than the air time, so the channel page is the only
   *  reliable source at ingest. */
  upcomingVideoIds: string[];
  /** Video ids the channel-page scrape identified as members-only
   *  (entries flagged with a `BADGE_MEMBERS_ONLY` badge on the lockup,
   *  or `BADGE_STYLE_TYPE_MEMBERS_ONLY` on the legacy videoRenderer).
   *  Pulling them in would only burn a transcript fetch that's
   *  guaranteed to fail — the watch page requires channel membership
   *  to access. Surfaced separately so `mergeSnapshot` can drop the
   *  matching RSS entry as well, even though RSS typically omits
   *  members-only uploads. */
  memberOnlyVideoIds: string[];
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

  console.info(`[youtube] Scraping channel page: ${videosUrl}`);

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
    return {
      channelId,
      name,
      logoUrl,
      handle,
      videos: [],
      upcomingVideoIds: [],
      memberOnlyVideoIds: [],
    };
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(dataMatch[1]) as Record<string, unknown>;
  } catch {
    return {
      channelId,
      name,
      logoUrl,
      handle,
      videos: [],
      upcomingVideoIds: [],
      memberOnlyVideoIds: [],
    };
  }

  const { videos, upcomingVideoIds, memberOnlyVideoIds } = extractVideosFromInitialData(data);
  return { channelId, name, logoUrl, handle, videos, upcomingVideoIds, memberOnlyVideoIds };
}

type YtData = Record<string, unknown>;

/**
 * Walks the selected tab's `richGridRenderer.contents` array. When we fetch
 * `/videos`, the Videos tab is the selected tab, and its rich grid contains
 * the channel's uploads in chronological (newest-first) order. Each entry
 * is wrapped either as the legacy `richItemRenderer.content.videoRenderer`
 * or — on YouTube's newer rollout — as `richItemRenderer.content.lockupViewModel`.
 * Both shapes are handled; channels can ship a mix or flip between them.
 */
/**
 * Detect whether a `lockupViewModel` entry represents a scheduled
 * premiere / upcoming livestream. The lockup shape doesn't expose
 * an `upcomingEventData` field — instead the metadata-row text
 * carries strings like "Premieres 5/15/26, 3:45 AM" or "N waiting".
 * Match those literally; anything aired carries a view count + a
 * relative date instead. Exported via the snapshot fixture path
 * only — not part of the public module surface.
 */
function isLockupUpcoming(lockup: YtData): boolean {
  for (const content of collectLockupMetadataTexts(lockup)) {
    // YouTube's localized strings for upcoming premieres / streams
    // all carry one of these stems on the en-US rollout we scrape
    // with. A more language-agnostic detection would require
    // walking thumbnail overlay icons, but for now we always
    // scrape the en-US channel page.
    if (/Premieres?\b/i.test(content) || /\bwaiting\b/i.test(content)) {
      return true;
    }
  }
  return false;
}

/**
 * Detect whether a `lockupViewModel` entry represents a members-only
 * video. The signal lives in the metadata rows as a `badgeViewModel`
 * whose `badgeStyle` is `BADGE_MEMBERS_ONLY` (and whose `badgeText` is
 * the localized "Members only" string). Style is more stable than
 * the localized text — match the style first, fall back to the text
 * for resilience.
 */
function isLockupMembersOnly(lockup: YtData): boolean {
  const metadata = (lockup.metadata as YtData)?.lockupMetadataViewModel as YtData | undefined;
  const rows = ((metadata?.metadata as YtData)?.contentMetadataViewModel as YtData)
    ?.metadataRows as YtData[] | undefined;
  if (rows == null) {
    return false;
  }
  for (const row of rows) {
    const badges = (row as YtData).badges as YtData[] | undefined;
    if (badges == null) {
      continue;
    }
    for (const badge of badges) {
      const badgeView = (badge as YtData).badgeViewModel as YtData | undefined;
      if (badgeView == null) {
        continue;
      }
      const style = badgeView.badgeStyle as string | undefined;
      if (style === 'BADGE_MEMBERS_ONLY') {
        return true;
      }
      const text = badgeView.badgeText as string | undefined;
      if (text != null && /members only/i.test(text)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Detect whether a legacy `videoRenderer` entry is members-only.
 * The badge lives at `badges[].metadataBadgeRenderer` with
 * `style: "BADGE_STYLE_TYPE_MEMBERS_ONLY"` (or a localized
 * "Members only" label/tooltip).
 */
function isVideoRendererMembersOnly(v: YtData): boolean {
  const badges = v.badges as YtData[] | undefined;
  if (badges == null) {
    return false;
  }
  for (const badge of badges) {
    const renderer = (badge as YtData).metadataBadgeRenderer as YtData | undefined;
    if (renderer == null) {
      continue;
    }
    const style = renderer.style as string | undefined;
    if (style === 'BADGE_STYLE_TYPE_MEMBERS_ONLY') {
      return true;
    }
    const label = renderer.label as string | undefined;
    const tooltip = renderer.tooltip as string | undefined;
    if (
      (label != null && /members only/i.test(label)) ||
      (tooltip != null && /members only/i.test(tooltip))
    ) {
      return true;
    }
  }
  return false;
}

function collectLockupMetadataTexts(lockup: YtData): string[] {
  const out: string[] = [];
  const metadata = (lockup.metadata as YtData)?.lockupMetadataViewModel as YtData | undefined;
  const rows = ((metadata?.metadata as YtData)?.contentMetadataViewModel as YtData)
    ?.metadataRows as YtData[] | undefined;
  if (rows == null) {
    return out;
  }
  for (const row of rows) {
    const parts = (row as YtData).metadataParts as YtData[] | undefined;
    if (parts == null) {
      continue;
    }
    for (const part of parts) {
      const content = ((part as YtData).text as YtData)?.content as string | undefined;
      if (content != null) {
        out.push(content);
      }
    }
  }
  return out;
}

/**
 * Extract the title, relative-time string, and duration text from a
 * `lockupViewModel` entry. YouTube rolled this shape out as the
 * replacement for the legacy `videoRenderer` on channel /videos tabs.
 * Title lives at `metadata.lockupMetadataViewModel.title.content`,
 * relative time is one of the `metadataParts` text contents (e.g.
 * "6 hours ago"), and duration is rendered as a thumbnail badge text
 * (e.g. "43:36") inside `contentImage.thumbnailViewModel.overlays`.
 */
function extractLockupAired(lockup: YtData): ScrapedVideo | null {
  const videoId = lockup.contentId as string | undefined;
  if (videoId == null) {
    return null;
  }

  const metadata = (lockup.metadata as YtData)?.lockupMetadataViewModel as YtData | undefined;
  const title = ((metadata?.title as YtData)?.content as string | undefined) ?? UNKNOWN_VIDEO_TITLE;

  // The metadata rows look like ["4.6K views", "6 hours ago"]. Pick the
  // first text that parses as a relative time so view-count strings
  // (and other non-time parts) don't poison the timestamp.
  let publishedAt: Date | null = null;
  for (const text of collectLockupMetadataTexts(lockup)) {
    const parsed = parseRelativeTime(text);
    if (parsed != null) {
      publishedAt = parsed;
      break;
    }
  }

  const overlays = ((lockup.contentImage as YtData)?.thumbnailViewModel as YtData)?.overlays as
    | YtData[]
    | undefined;
  let durationSeconds: number | null = null;
  if (overlays != null) {
    for (const overlay of overlays) {
      const bottom = (overlay as YtData).thumbnailBottomOverlayViewModel as YtData | undefined;
      if (bottom == null) {
        continue;
      }
      const badges = bottom.badges as YtData[] | undefined;
      if (badges == null) {
        continue;
      }
      for (const badge of badges) {
        const text = ((badge as YtData).thumbnailBadgeViewModel as YtData)?.text as
          | string
          | undefined;
        const parsed = parseDurationText(text);
        if (parsed != null) {
          durationSeconds = parsed;
          break;
        }
      }
      if (durationSeconds != null) {
        break;
      }
    }
  }

  // Lockup entries don't expose a descriptionSnippet — keep it empty,
  // matching how the RSS path handles entries with no description.
  return {
    videoId,
    title,
    description: '',
    publishedAt,
    durationSeconds,
  };
}

function extractVideosFromInitialData(data: YtData): {
  videos: ScrapedVideo[];
  upcomingVideoIds: string[];
  memberOnlyVideoIds: string[];
} {
  const tabs = ((data.contents as YtData)?.twoColumnBrowseResultsRenderer as YtData)?.tabs as
    | YtData[]
    | undefined;
  if (!tabs) {
    return { videos: [], upcomingVideoIds: [], memberOnlyVideoIds: [] };
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
    return { videos: [], upcomingVideoIds: [], memberOnlyVideoIds: [] };
  }

  const richGridContents = (((selectedTab as YtData).tabRenderer as YtData)?.content as YtData)
    ?.richGridRenderer as YtData | undefined;
  const items = (richGridContents?.contents as YtData[]) ?? [];

  const videos: ScrapedVideo[] = [];
  const upcomingVideoIds: string[] = [];
  const memberOnlyVideoIds: string[] = [];
  for (const item of items) {
    const richItem = (item as YtData).richItemRenderer as YtData | undefined;
    const content = richItem?.content as YtData | undefined;

    // YouTube ships two distinct shapes for entries in the /videos
    // tab depending on rollout: the legacy `videoRenderer` and the
    // newer `lockupViewModel`. Handle the lockup shape first so we
    // can detect "Premieres …"-style upcoming markers it carries in
    // its metadata text rows — that's the only place a scheduled
    // premiere shows up on this rollout.
    const lockup = content?.lockupViewModel as YtData | undefined;
    if (lockup != null) {
      const lockupId = lockup.contentId as string | undefined;
      if (lockupId == null) {
        continue;
      }
      if (isLockupUpcoming(lockup)) {
        upcomingVideoIds.push(lockupId);
        continue;
      }
      if (isLockupMembersOnly(lockup)) {
        memberOnlyVideoIds.push(lockupId);
        continue;
      }
      const aired = extractLockupAired(lockup);
      if (aired != null) {
        videos.push(aired);
      }
      continue;
    }

    const v = content?.videoRenderer as YtData | undefined;
    if (v?.videoId == null) {
      // Skip continuationItemRenderer, ad slots, etc.
      continue;
    }

    const videoId = v.videoId as string;

    // Scheduled livestreams and unaired premieres carry an
    // `upcomingEventData` block with a future `startTime`. Pulling
    // them in would only burn a transcript fetch that's guaranteed
    // to 404 — and worse, the sticky `transcript_unavailable` flag
    // would then block re-fetching after the stream actually airs.
    // Record the id so `mergeSnapshot` can also drop the matching
    // RSS entry — RSS reports the upload time, not the air time, so
    // its own "published > now" filter misses pre-uploaded premieres.
    if (v.upcomingEventData != null) {
      upcomingVideoIds.push(videoId);
      continue;
    }

    // Members-only videos require a channel-membership signed-in
    // session to load — the watch page returns a paywall stub and
    // the transcript fetch is guaranteed to fail. Treat them like
    // upcoming videos: surface the id so `mergeSnapshot` can drop a
    // matching RSS entry too, even though RSS typically omits them.
    if (isVideoRendererMembersOnly(v)) {
      memberOnlyVideoIds.push(videoId);
      continue;
    }

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

  return { videos, upcomingVideoIds, memberOnlyVideoIds };
}
