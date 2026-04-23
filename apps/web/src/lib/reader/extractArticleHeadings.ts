import type { TocItem } from '@/components/reader/FloatingToc';

// Match `##` or `###` headings only. Articles are rendered without the
// video title (`#` is reserved and not used by the generator), and h4+
// rarely appears in practice — two levels is enough to drive a TOC
// without crowding the popup.
const HEADING_RE = /^(##|###)\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^\s*```/;

/**
 * Walks the markdown body line-by-line, collects `##` and `###`
 * headings, and assigns each one a DOM id derived from its line number.
 *
 * The companion `ArticleMarkdown` override generates the same ids via
 * `node.position.start.line` — both read from the same stripped body,
 * so the counters line up. Code fences are skipped so that `## hash`
 * inside a triple-backtick block doesn't get promoted to a heading.
 */
export function extractArticleHeadings(body: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = body.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const match = HEADING_RE.exec(line);
    if (match == null) {
      continue;
    }
    const level = match[1].length === 2 ? 2 : 3;
    const text = match[2].trim();
    if (text.length === 0) {
      continue;
    }
    items.push({
      id: headingDomId(level, i + 1),
      label: text,
      level,
    });
  }
  return items;
}

/**
 * Stable DOM id for a markdown heading. Shared by the TOC extractor
 * and the `ArticleMarkdown` heading override so clicks resolve.
 */
export function headingDomId(level: 2 | 3, line: number): string {
  return `toc-h${level}-${line}`;
}
