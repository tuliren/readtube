/**
 * Flatten markdown into plain text for structured data (FAQPage
 * answers, Article descriptions), where markup would show up
 * literally. Paragraphs and list items each become their own line.
 *
 * Handles the inline subset AI summaries and marketing copy use:
 * headings, `-` / `*` / `+` bullets, links and images (kept as their
 * text), `**bold**` / `__bold__`, `*italic*` / `_italic_`, and
 * `` `code` ``. Emphasis is unwrapped only when the markers pair up
 * around non-space text, so a lone `*` (`5 * 3`, `C*`), a stray
 * backtick, or a `snake_case` word survives unchanged.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^#{1,6}\s+/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/(\*\*|__)(\S(?:.*?\S)?)\1/g, '$2')
        .replace(/\*(\S(?:.*?\S)?)\*/g, '$1')
        .replace(/(^|\W)_(\S(?:.*?\S)?)_(?!\w)/g, '$1$2')
    )
    .filter((line) => line.length > 0)
    .join('\n');
}
