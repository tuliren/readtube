import { FULL_WEBSITE_URL, TITLE } from '@/constants';
import { markdownToPlainText } from '@/lib/markdown/plainText';
import { parseMarkdownDocument } from '@/lib/markdownFrontmatter';
import { ORGANIZATION_ID, organizationJsonLd } from '@/lib/seo/organization';
import { isEmptyString, toOneLine } from '@/lib/string';
import type { VideoData } from '@/lib/types';
import { buildChannelLink, buildEmbedUrl, buildWatchLink } from '@/lib/urls/watchUrl';
import {
  publicChannelName,
  publicVideoDescription,
  publicVideoTitle,
} from '@/lib/videos/publicFields';

/** The video fields the public page's JSON-LD reads. */
export type VideoJsonLdVideo = Pick<
  VideoData,
  | 'title'
  | 'description'
  | 'sourceId'
  | 'platform'
  | 'publishedAt'
  | 'durationSeconds'
  | 'thumbnailUrl'
  | 'channelName'
  | 'channelSourceId'
>;

/**
 * Freshness and language of the AI content a public page renders.
 * Dates are ISO strings: the earliest and latest `generated_at` of the
 * READY summary / article rows the page serves.
 */
export interface PublicContentMeta {
  datePublished: string | null;
  dateModified: string | null;
  /** BCP-47 code of the rendered content, or null when unknown. */
  language: string | null;
  /** Short summary paragraph, used as the Article description. */
  description: string | null;
}

export interface VideoJsonLdInput {
  /** Absolute canonical URL of the public page. */
  pageUrl: string;
  video: VideoJsonLdVideo;
  content: PublicContentMeta | null;
}

/**
 * Format a duration in seconds as ISO 8601 (`PT1H2M3S`), the format
 * schema.org's `duration` expects. Returns null for missing or invalid
 * input, and `PT0S` for zero.
 */
export function toIsoDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  let out = 'PT';
  if (hours > 0) {
    out += `${hours}H`;
  }
  if (minutes > 0) {
    out += `${minutes}M`;
  }
  if (secs > 0 || out === 'PT') {
    out += `${secs}S`;
  }
  return out;
}

/**
 * Turn a stored summary paragraph (markdown, optionally with a
 * frontmatter header) into one line of plain text for a JSON-LD or
 * meta `description`: drops the frontmatter, flattens the markdown
 * with {@link markdownToPlainText}, and collapses whitespace. Returns
 * null when nothing is left.
 */
export function toPlainDescription(markdown: string | null | undefined): string | null {
  if (markdown == null) {
    return null;
  }
  return toOneLine(markdownToPlainText(parseMarkdownDocument(markdown).content));
}

/**
 * Earliest and latest of the given `generated_at` timestamps, as ISO
 * strings. The earliest is when the page first had content to read
 * (published); the latest is its most recent regeneration (modified).
 */
export function pickContentDates(dates: (Date | null | undefined)[]): {
  datePublished: string | null;
  dateModified: string | null;
} {
  const times = dates
    .filter((d): d is Date => d != null && !Number.isNaN(d.getTime()))
    .map((d) => d.getTime());
  if (times.length === 0) {
    return { datePublished: null, dateModified: null };
  }
  return {
    datePublished: new Date(Math.min(...times)).toISOString(),
    dateModified: new Date(Math.max(...times)).toISOString(),
  };
}

/** Drop keys whose value is null or undefined so the JSON-LD stays clean. */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null)) as Partial<T>;
}

/**
 * Build the JSON-LD graph for a public video page (`/p/videos/[id]`):
 *
 *   - `Article`: the AI-generated reading version. Its author and
 *     publisher are the ReadTube Organization, not a person, since no
 *     human wrote the text. It is based on, and about, the source video.
 *   - `VideoObject`: the source video, credited to its channel. Google
 *     rejects a VideoObject without `name`, `thumbnailUrl`, or
 *     `uploadDate`, so the node is left out when the video lacks any of
 *     them (a degraded scrape, say); the Article's `isBasedOn` then
 *     names the watch URL and `about` is dropped. Its `description` is
 *     the summary paragraph, falling back to the video's own
 *     description. Titles, channel names, and descriptions go through
 *     `lib/videos/publicFields`, so blanks and scrape placeholders count
 *     as missing.
 *   - `BreadcrumbList`: Home → channel → this page. The channel has no
 *     public page on ReadTube, so its crumb points at the platform's
 *     channel page. Google requires a name on every crumb: without a
 *     channel name the channel crumb is dropped, and without a title the
 *     list is left out, since the trail must end at this page.
 *   - `Organization`: repeated here so the Article's `@id` references
 *     resolve within the page.
 */
export function buildVideoJsonLd({ pageUrl, video, content }: VideoJsonLdInput) {
  const videoId = `${pageUrl}#video`;
  const title = publicVideoTitle(video.title);
  const thumbnailUrl = isEmptyString(video.thumbnailUrl) ? null : video.thumbnailUrl.trim();
  const channelName = publicChannelName(video.platform, video.channelName);
  const channelUrl = buildChannelLink(video.platform, video.channelSourceId).url;
  const watchUrl = buildWatchLink(video.platform, video.sourceId).url;
  const channel =
    channelName != null ? { '@type': 'Organization', name: channelName, url: channelUrl } : null;

  const videoObject =
    title != null && thumbnailUrl != null && video.publishedAt != null
      ? compact({
          '@type': 'VideoObject',
          '@id': videoId,
          name: title,
          description: content?.description ?? publicVideoDescription(video.description),
          thumbnailUrl,
          uploadDate: video.publishedAt,
          duration: toIsoDuration(video.durationSeconds),
          embedUrl: buildEmbedUrl(video.platform, video.sourceId),
          url: watchUrl,
          author: channel,
          creator: channel,
        })
      : null;

  const article = compact({
    '@type': 'Article',
    '@id': `${pageUrl}#article`,
    headline: title,
    description: content?.description,
    url: pageUrl,
    mainEntityOfPage: pageUrl,
    image: thumbnailUrl,
    inLanguage: content?.language,
    datePublished: content?.datePublished,
    dateModified: content?.dateModified,
    author: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
    isBasedOn: videoObject != null ? { '@id': videoId } : watchUrl,
    about: videoObject != null ? { '@id': videoId } : null,
  });

  const breadcrumbs =
    title != null
      ? {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { name: TITLE, item: FULL_WEBSITE_URL },
            ...(channelName != null ? [{ name: channelName, item: channelUrl }] : []),
            { name: title, item: pageUrl },
          ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, ...c })),
        }
      : null;

  return {
    '@context': 'https://schema.org',
    '@graph': [article, videoObject, breadcrumbs, organizationJsonLd].filter((n) => n != null),
  };
}
