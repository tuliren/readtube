import { escapeMarkdownText } from '@/lib/markdown/escape';

export interface VideoMarkdownInput {
  title: string;
  channelName: string;
  channelUrl: string;
  /** ISO timestamp of the original upload, or null when unknown. */
  publishedAt: string | null;
  platformName: string;
  watchUrl: string;
  /** Absolute canonical URL of the public reader page. */
  readerUrl: string;
  /** Human name of the language the summary/article are in. */
  languageName: string | null;
  /** Frontmatter-stripped summary fields, or null when there is none. */
  summary: { headline: string; short: string; full: string } | null;
  /** Frontmatter-stripped article markdown, or null when there is none. */
  article: string | null;
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
  if (input.languageName != null) {
    lines.push(`- Language: ${input.languageName}`);
  }
  lines.push('');

  if (input.summary != null) {
    lines.push('## Summary', '', `**${input.summary.headline.trim()}**`, '');
    lines.push(input.summary.short.trim(), '');
    lines.push(input.summary.full.trim(), '');
  }

  if (input.article != null) {
    lines.push('## Article', '', demoteHeadings(input.article.trim()), '');
  }

  return lines.join('\n');
}
