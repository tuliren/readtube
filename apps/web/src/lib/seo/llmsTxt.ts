import { FULL_WEBSITE_URL, TITLE } from '@/constants';
import { escapeMarkdownText } from '@/lib/markdown/escape';
import { HOME_MARKDOWN_PATH } from '@/lib/markdown/home';
import { type SitemapVideoRow, latestPublicGenerationAt } from '@/lib/sitemap/publicVideoSitemap';
import { publicVideoMarkdownPath } from '@/lib/urls/publicVideoHref';

/** How many public videos `/llms.txt` lists under "Recent reads". */
export const LLMS_TXT_RECENT_READS = 50;

export interface LlmsTxtVideo {
  sourceId: string;
  title: string;
  channelName: string;
}

/**
 * Pick the newest public videos for "Recent reads" from sitemap
 * candidate rows (already newest-first), applying the same
 * latest-transcript rule as the sitemap and the public page.
 */
export function selectRecentReads(
  rows: SitemapVideoRow[],
  limit: number = LLMS_TXT_RECENT_READS
): LlmsTxtVideo[] {
  return rows
    .filter((row) => latestPublicGenerationAt(row) != null)
    .slice(0, limit)
    .map((row) => ({ sourceId: row.source_id, title: row.title, channelName: row.channel.name }));
}

const SUMMARY =
  'ReadTube turns YouTube and Bilibili videos into readable summaries and full-length articles, so you can read, search, and annotate your video subscriptions like a newsletter inbox.';

/**
 * `/llms.txt` per https://llmstxt.org: an H1, a blockquote summary,
 * then sections of annotated links. Every link points at a markdown
 * rendition where one exists, since that is what agents read best.
 * Pure: the route loads the videos.
 */
export function buildLlmsTxt(videos: LlmsTxtVideo[]): string {
  const lines: string[] = [
    `# ${TITLE}`,
    '',
    `> ${SUMMARY}`,
    '',
    'Links point at markdown renditions where they exist. The homepage and public video pages also return markdown from their regular URLs when requested with `Accept: text/markdown`.',
    '',
    '## Product',
    '',
    `- [Homepage](${FULL_WEBSITE_URL}${HOME_MARKDOWN_PATH}): what ReadTube does, features, pricing, and FAQ`,
    `- [Pricing](${FULL_WEBSITE_URL}/#pricing): free self-hosting and the cloud plans`,
    `- [FAQ](${FULL_WEBSITE_URL}/#faq): supported platforms, who it is for, and how it differs from summarizers`,
    `- [Full text](${FULL_WEBSITE_URL}/llms-full.txt): the homepage, terms, and privacy policy in one file`,
    '',
    '## Legal',
    '',
    `- [Terms of Service](${FULL_WEBSITE_URL}/terms)`,
    `- [Privacy Policy](${FULL_WEBSITE_URL}/privacy)`,
    '',
  ];

  if (videos.length > 0) {
    lines.push('## Recent reads', '');
    for (const video of videos) {
      lines.push(
        `- [${escapeMarkdownText(video.title)}](${FULL_WEBSITE_URL}${publicVideoMarkdownPath(video.sourceId)}): summary and article of a video by ${escapeMarkdownText(video.channelName)}`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * `/llms-full.txt`: the homepage markdown plus the legal documents,
 * concatenated so an agent can read the whole site's static copy in
 * one request. Video bodies are deliberately left out; they are
 * listed in `/llms.txt` and fetched individually.
 */
export function buildLlmsFullTxt(sections: {
  home: string;
  terms: string;
  privacy: string;
}): string {
  return [sections.home, sections.terms, sections.privacy]
    .map((section) => section.trim())
    .join('\n\n---\n\n')
    .concat('\n');
}
