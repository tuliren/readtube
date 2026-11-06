import { escapeMarkdownText } from '@/lib/markdown/escape';

export interface VideoMarkdownInput {
  title: string;
  channelName: string;
  channelUrl: string;
  /** ISO timestamp of the original upload, or null when unknown. */
  publishedAt: string | null;
  platformName: string;
  watchUrl: string;
  /** Absolute URL of the public reader page showing this version. */
  readerUrl: string;
  /**
   * Frontmatter-stripped summary fields, or null when there is none.
   * `languageName` is the human name of the version served, which the
   * share-language fallback can pick independently of the article's.
   */
  summary: { headline: string; short: string; full: string; languageName: string } | null;
  /** Frontmatter-stripped article markdown, or null when there is none. */
  article: { content: string; languageName: string } | null;
}

const ATX_HEADING = /^(#{1,5})(\s)/;
const FENCE = /^\s*(```|~~~)/;

/**
 * Push every ATX heading in `markdown` one level deeper, skipping
 * fenced code blocks, so a generated article nests under the page's
 * own `## Article` heading instead of competing with it. Level-6
 * headings stay at 6, the deepest markdown allows.
 */
export function demoteHeadings(markdown: string): string {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (FENCE.test(line)) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : line.replace(ATX_HEADING, '#$1$2');
    })
    .join('\n');
}

/**
 * One `Language` line when the summary and article are in the same
 * language (the usual case), otherwise one line per section, so the
 * label never misdescribes a section the fallback served in another
 * language.
 */
function languageLines(summary: string | undefined, article: string | undefined): string[] {
  if (summary == null || article == null || summary === article) {
    const only = summary ?? article;
    return only == null ? [] : [`- Language: ${only}`];
  }
  return [`- Summary language: ${summary}`, `- Article language: ${article}`];
}

/**
 * Markdown rendition of a public video page (`/p/videos/:id.md`, and
 * the page itself under `Accept: text/markdown`): a metadata block,
 * then the summary and article the HTML reader would show. Pure: the
 * caller resolves language and loads content.
 */
export function buildVideoMarkdown(input: VideoMarkdownInput): string {
  const lines: string[] = [`# ${escapeMarkdownText(input.title)}`, ''];

  lines.push(`- Channel: [${escapeMarkdownText(input.channelName)}](${input.channelUrl})`);
  if (input.publishedAt != null) {
    lines.push(`- Published: ${input.publishedAt.slice(0, 10)}`);
  }
  lines.push(`- Source video: [Watch on ${input.platformName}](${input.watchUrl})`);
  lines.push(`- Read on ReadTube: ${input.readerUrl}`);
  lines.push(...languageLines(input.summary?.languageName, input.article?.languageName));
  lines.push('');

  if (input.summary != null) {
    lines.push('## Summary', '', `**${escapeMarkdownText(input.summary.headline)}**`, '');
    lines.push(input.summary.short.trim(), '');
    lines.push(input.summary.full.trim(), '');
  }

  if (input.article != null) {
    lines.push('## Article', '', demoteHeadings(input.article.content.trim()), '');
  }

  return lines.join('\n');
}
