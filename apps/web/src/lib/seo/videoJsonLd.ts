import { FULL_WEBSITE_URL, TITLE } from '@/constants';
import { parseMarkdownDocument } from '@/lib/markdownFrontmatter';
import { ORGANIZATION_ID, organizationJsonLd } from '@/lib/seo/organization';
import type { VideoData } from '@/lib/types';
import { buildChannelLink, buildEmbedUrl, buildWatchLink } from '@/lib/urls/watchUrl';

/** The video fields the public page's JSON-LD reads. */
export type VideoJsonLdVideo = Pick<
  VideoData,
  | 'title'
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
 * frontmatter header) into plain text for a JSON-LD `description`:
 * drops the frontmatter, unwraps links, strips emphasis / code / heading
 * markers, and collapses whitespace. Returns null when nothing is left.
 */
export function toPlainDescription(markdown: string | null | undefined): string | null {
  if (markdown == null) {
    return null;
  }
  const text = parseMarkdownDocument(markdown)
    .content.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__|\*|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 0 ? text : null;
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
 *   - `VideoObject`: the source video, credited to its channel.
 *   - `BreadcrumbList`: Home → channel → this page. The channel has no
 *     public page on ReadTube, so its crumb points at the platform's
 *     channel page.
 *   - `Organization`: repeated here so the Article's `@id` references
 *     resolve within the page.
 */
export function buildVideoJsonLd({ pageUrl, video, content }: VideoJsonLdInput) {
  const videoId = `${pageUrl}#video`;
  const channelUrl = buildChannelLink(video.platform, video.channelSourceId).url;
  const channel = {
    '@type': 'Organization',
    name: video.channelName,
    url: channelUrl,
  };

  const videoObject = compact({
    '@type': 'VideoObject',
    '@id': videoId,
    name: video.title,
    thumbnailUrl: video.thumbnailUrl,
    uploadDate: video.publishedAt,
    duration: toIsoDuration(video.durationSeconds),
    embedUrl: buildEmbedUrl(video.platform, video.sourceId),
    url: buildWatchLink(video.platform, video.sourceId).url,
    author: channel,
    creator: channel,
  });

  const article = compact({
    '@type': 'Article',
    '@id': `${pageUrl}#article`,
    headline: video.title,
    description: content?.description,
    url: pageUrl,
    mainEntityOfPage: pageUrl,
    image: video.thumbnailUrl,
    inLanguage: content?.language,
    datePublished: content?.datePublished,
    dateModified: content?.dateModified,
    author: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
    isBasedOn: { '@id': videoId },
    about: { '@id': videoId },
  });

  const breadcrumbs = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: TITLE, item: FULL_WEBSITE_URL },
      { '@type': 'ListItem', position: 2, name: video.channelName, item: channelUrl },
      { '@type': 'ListItem', position: 3, name: video.title, item: pageUrl },
    ],
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [article, videoObject, breadcrumbs, organizationJsonLd],
  };
}
