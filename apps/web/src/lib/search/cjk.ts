/**
 * CJK-aware keyword matching helpers.
 *
 * The tsvector powering video keyword search uses the `english`
 * config, which tokenizes on whitespace and punctuation — an
 * unsegmented CJK title like 对话诺兰 becomes one opaque token, so a
 * partial query like 诺兰 can never match it. When a query contains
 * CJK characters we switch to substring matching (ILIKE backed by the
 * pg_trgm GIN indexes on Video.title/description) and reproduce the
 * tsquery path's behaviors in process: title/description match
 * classification and `[[` `]]` hit delimiters for highlighting.
 */

// Extended_Pictographic-style property escapes need the `u` flag; the
// workspace tsconfig targets es5 which rejects `/.../u` literals, so
// build with `new RegExp` at runtime (same pattern as channelName.ts).
const CJK_RE = new RegExp(
  '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}]',
  'u'
);

/** True when the text contains any Han / Hiragana / Katakana / Hangul. */
export function containsCjk(text: string): boolean {
  return CJK_RE.test(text);
}

// Bound the number of AND'ed ILIKE clauses a single query can produce.
const MAX_TERMS = 8;

/** Split a query into whitespace-delimited terms, capped at MAX_TERMS. */
export function searchTerms(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean).slice(0, MAX_TERMS);
}

/** `%term%` with LIKE wildcards (%, _) and backslash escaped. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, '\\$&')}%`;
}

/**
 * Wrap every case-insensitive occurrence of each term in `[[` `]]`,
 * merging overlapping occurrences so nested delimiters can't occur.
 * Mirrors ts_headline's delimiter convention on the tsquery path; the
 * client splits on the delimiters and renders <mark> elements.
 */
export function markMatches(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    const needle = term.toLowerCase();
    if (needle.length === 0) {
      continue;
    }
    let index = lower.indexOf(needle);
    while (index >= 0) {
      ranges.push([index, index + needle.length]);
      index = lower.indexOf(needle, index + needle.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last != null && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([range[0], range[1]]);
    }
  }
  let out = '';
  let position = 0;
  for (const [start, end] of merged) {
    out += `${text.slice(position, start)}[[${text.slice(start, end)}]]`;
    position = end;
  }
  return out + text.slice(position);
}

// Snippet window: characters kept before the first hit and total
// window length. CJK carries ~2x information per character vs English
// words, so a shorter window than ts_headline's word-based one reads
// fine.
const SNIPPET_BEFORE = 20;
const SNIPPET_LENGTH = 80;

/**
 * A one-line description fragment around the first term hit, with all
 * hits inside the window marked. Returns null when no term appears —
 * the equivalent of a title-only match on the tsquery path.
 */
export function buildCjkSnippet(description: string, terms: string[]): string | null {
  const lower = description.toLowerCase();
  let first = -1;
  for (const term of terms) {
    const index = lower.indexOf(term.toLowerCase());
    if (index >= 0 && (first < 0 || index < first)) {
      first = index;
    }
  }
  if (first < 0) {
    return null;
  }
  const start = Math.max(0, first - SNIPPET_BEFORE);
  const end = Math.min(description.length, start + SNIPPET_LENGTH);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < description.length ? '…' : '';
  return `${prefix}${markMatches(description.slice(start, end), terms)}${suffix}`;
}
