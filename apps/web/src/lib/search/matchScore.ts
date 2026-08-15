/**
 * Lightweight relevance scoring for matching short labels (channel
 * names, playlist names, sidebar entries) against a user-typed query.
 *
 * Postgres full-text ranking (ts_rank) covers video title/description
 * search; this helper covers the "name-like" candidates where a
 * tsvector is overkill and substring position is the signal that
 * matters: an exact match beats a prefix match beats a word-boundary
 * match beats an anywhere-substring match.
 */

const SCORE_EXACT = 100;
const SCORE_PREFIX = 50;
const SCORE_WORD_PREFIX = 30;
const SCORE_SUBSTRING = 10;

/**
 * Score how well `text` matches `query`, case-insensitively.
 * Returns 0 when the query does not appear in the text at all.
 */
export function matchScore(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.trim().toLowerCase();
  if (q.length === 0) {
    return 0;
  }
  if (t === q) {
    return SCORE_EXACT;
  }
  if (t.startsWith(q)) {
    return SCORE_PREFIX;
  }
  const index = t.indexOf(q);
  if (index < 0) {
    return 0;
  }
  // Word-boundary match: the character before the hit is not a letter
  // or digit ("Fireship" matching "ship" scores lower than "The Ship
  // Show" matching "ship").
  const before = t[index - 1];
  if (!/[a-z0-9]/.test(before)) {
    return SCORE_WORD_PREFIX;
  }
  return SCORE_SUBSTRING;
}

/**
 * Best score across several candidate strings for one entity — e.g. a
 * channel's display name and its `@handle`. Null/empty candidates are
 * skipped.
 */
export function bestMatchScore(texts: Array<string | null | undefined>, query: string): number {
  let best = 0;
  for (const text of texts) {
    if (text == null || text.length === 0) {
      continue;
    }
    const score = matchScore(text, query);
    if (score > best) {
      best = score;
    }
  }
  return best;
}

/**
 * Sort `items` by descending match score (computed via `getTexts`) with
 * a stable alphabetical tiebreak on `getLabel`, dropping non-matches.
 */
export function rankByMatchScore<T>(
  items: T[],
  query: string,
  getTexts: (item: T) => Array<string | null | undefined>,
  getLabel: (item: T) => string
): T[] {
  return items
    .map((item) => ({ item, score: bestMatchScore(getTexts(item), query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || getLabel(a.item).localeCompare(getLabel(b.item)))
    .map((entry) => entry.item);
}
