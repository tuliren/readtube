/**
 * Escape text interpolated into a markdown link label (`[label](url)`)
 * or a heading, so a stray bracket, asterisk, or backslash in a
 * user-facing title can't break the surrounding syntax. Also collapses
 * whitespace, since a newline would end the line the text sits on.
 */
export function escapeMarkdownText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\`*_[\]<>#|])/g, '\\$1');
}
