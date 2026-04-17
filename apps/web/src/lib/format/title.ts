/**
 * Shared cap for page `<title>` tags. Matches the original limit used
 * on the internal video reader — long YouTube titles get truncated in
 * the browser tab anyway, and this way every surface shares a single
 * wording/casing rule. An ellipsis (`…`, U+2026) is appended when the
 * input exceeds the cap.
 */
export const PAGE_TITLE_CAP = 60;

export function capTitle(title: string, max: number = PAGE_TITLE_CAP): string {
  if (title.length <= max) {
    return title;
  }
  return `${title.slice(0, max - 1).trimEnd()}…`;
}
