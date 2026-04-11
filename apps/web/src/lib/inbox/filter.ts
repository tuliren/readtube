import type { InboxQuery } from '@/lib/types';

/**
 * URL <-> InboxQuery codec. One canonical serialization shared by the
 * sidebar, header, saved views, and /api/videos.
 *
 * Rules:
 * - Unknown keys are dropped (forward-compat via SavedView JSON).
 * - Empty strings are treated as absent.
 * - Booleans: `?unread=1` or `?unread=true` is true; anything else is false.
 * - tagIds is comma-separated in the URL (`?tag=a,b,c`).
 * - from/to are ISO date strings (YYYY-MM-DD ok; server normalizes).
 * - Defaults (sort='newest', includeSnoozed=false) are NOT emitted when
 *   encoding, so a "default" view has an empty query string.
 */

const BOOL_KEYS = ['unread', 'starred', 'saved', 'archived', 'snoozed', 'includeSnoozed'] as const;
const STRING_KEYS = ['q', 'channelId', 'folderId', 'from', 'to'] as const;
type BoolKey = (typeof BOOL_KEYS)[number];
type StringKey = (typeof STRING_KEYS)[number];

function parseBool(value: string | null): boolean {
  if (value == null) {
    return false;
  }
  return value === '1' || value === 'true';
}

function pickString(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  if (value == null || value === '') {
    return undefined;
  }
  return value;
}

export function parseInboxQuery(params: URLSearchParams): InboxQuery {
  const query: InboxQuery = {};

  for (const key of STRING_KEYS) {
    const value = pickString(params, key);
    if (value != null) {
      query[key as StringKey] = value;
    }
  }

  for (const key of BOOL_KEYS) {
    if (params.has(key)) {
      query[key as BoolKey] = parseBool(params.get(key));
    }
  }

  const tagIdsRaw = pickString(params, 'tagIds');
  if (tagIdsRaw != null) {
    const tagIds = tagIdsRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (tagIds.length > 0) {
      query.tagIds = tagIds;
    }
  }

  const sort = pickString(params, 'sort');
  if (sort === 'newest' || sort === 'oldest') {
    query.sort = sort;
  }

  return query;
}

export function encodeInboxQuery(query: InboxQuery): URLSearchParams {
  const params = new URLSearchParams();

  for (const key of STRING_KEYS) {
    const value = query[key as StringKey];
    if (value != null && value !== '') {
      params.set(key, value);
    }
  }

  for (const key of BOOL_KEYS) {
    if (query[key as BoolKey] === true) {
      params.set(key, '1');
    }
  }

  if (query.tagIds != null && query.tagIds.length > 0) {
    params.set('tagIds', query.tagIds.join(','));
  }

  if (query.sort != null && query.sort !== 'newest') {
    params.set('sort', query.sort);
  }

  return params;
}

/**
 * True iff the query has at least one filter applied beyond the defaults.
 * Used to decide whether to show a "clear filters" button in the header.
 */
export function isDefaultQuery(query: InboxQuery): boolean {
  return encodeInboxQuery(query).toString().length === 0;
}

/**
 * Order-independent equality for two InboxQuery values. Used by
 * SavedViewMenu to mark the active saved view with a checkmark.
 *
 * The previous implementation compared `JSON.stringify(a) === JSON.stringify(b)`
 * which is sensitive to property insertion order — and the two sources
 * being compared insert keys differently:
 *   • A SavedView's `query` is round-tripped through a JSONB column,
 *     and PostgreSQL JSONB normalizes keys by length-then-lex order.
 *   • The current `query` comes from `parseInboxQuery`, which inserts
 *     keys in `STRING_KEYS` / `BOOL_KEYS` iteration order.
 * Mixed key sets like `{starred, saved}` round-trip to `{saved, starred}`,
 * so the active-view checkmark silently failed to render.
 *
 * This helper compares each canonical key explicitly. Booleans are
 * normalized so `false` and `undefined` are treated as the same (matching
 * how the encoder drops absent/false bools). `tagIds` is compared as a
 * sorted set so the same set of tags in different order still counts as
 * equal — that matches user intent (the filter applies to the set, not
 * the sequence) and protects against any future caller building tagIds
 * in a non-deterministic order.
 */
/**
 * The reader navigates to `/inbox/<videoId>?from=<encoded-inbox-query>`
 * so the Back link can restore the exact filtered list the user came
 * from. Both the SSR pages and the client-side hooks need to look at
 * the inner query for filtering, not the wrapper `from` param.
 *
 * This helper takes the raw URLSearchParams and returns either:
 *   - the URLSearchParams parsed from the `from` value, if present, or
 *   - a copy of the original with `from` stripped out, otherwise.
 *
 * Always returns a fresh URLSearchParams so callers can mutate it
 * without aliasing the React searchParams instance.
 */
export function extractInboxSearchParams(raw: URLSearchParams): URLSearchParams {
  const fromValue = raw.get('from');
  if (fromValue != null && fromValue.length > 0) {
    return new URLSearchParams(fromValue);
  }
  const copy = new URLSearchParams(raw);
  copy.delete('from');
  return copy;
}

export function inboxQueriesEqual(a: InboxQuery, b: InboxQuery): boolean {
  for (const key of STRING_KEYS) {
    if ((a[key] ?? '') !== (b[key] ?? '')) {
      return false;
    }
  }
  for (const key of BOOL_KEYS) {
    if ((a[key] === true) !== (b[key] === true)) {
      return false;
    }
  }
  const aSort = a.sort ?? 'newest';
  const bSort = b.sort ?? 'newest';
  if (aSort !== bSort) {
    return false;
  }
  const aTags = [...(a.tagIds ?? [])].sort();
  const bTags = [...(b.tagIds ?? [])].sort();
  if (aTags.length !== bTags.length) {
    return false;
  }
  for (let i = 0; i < aTags.length; i += 1) {
    if (aTags[i] !== bTags[i]) {
      return false;
    }
  }
  return true;
}
