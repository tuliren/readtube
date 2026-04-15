import type { InboxQuery } from '@/lib/types';

/**
 * URL <-> InboxQuery codec. One canonical serialization shared by the
 * sidebar, header, saved views, and /api/videos.
 *
 * Rules:
 * - Unknown keys are dropped (forward-compat).
 * - Empty strings are treated as absent.
 * - Booleans: `?unread=1` or `?unread=true` is true; anything else is false.
 * - tagIds is comma-separated in the URL (`?tag=a,b,c`).
 * - from/to are ISO date strings (YYYY-MM-DD ok; server normalizes).
 * - Defaults (sort='newest', page=1) are NOT
 *   emitted when encoding, so a "default" view has an empty query string.
 */

/**
 * Page size for the paginated inbox list. The API caps results at
 * this value and the client renders Prev / Page X of Y / Next in
 * the InboxHeader once the total exceeds it.
 */
export const PAGE_SIZE = 25;

const BOOL_KEYS = ['unread', 'starred', 'saved', 'archived'] as const;
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

  // Page is a positive integer; anything else (including '1', the
  // default) is dropped from the parsed query so callers see
  // `query.page === undefined` as the canonical "page 1" state.
  const pageRaw = pickString(params, 'page');
  if (pageRaw != null) {
    const parsed = Number.parseInt(pageRaw, 10);
    if (Number.isFinite(parsed) && parsed > 1) {
      query.page = parsed;
    }
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

  // Drop the default page so the URL stays clean — `?page=1` is
  // semantically identical to no page param at all.
  if (query.page != null && query.page > 1) {
    params.set('page', String(query.page));
  }

  return params;
}

/**
 * True iff the query has at least one filter applied beyond the defaults.
 * Used to decide whether to show a "clear filters" button in the header.
 *
 * Page is intentionally ignored — paginating to page 2 of the Inbox
 * view is still semantically "the Inbox view". We strip `page`
 * before checking by feeding a copy to the encoder.
 */
export function isDefaultQuery(query: InboxQuery): boolean {
  const { page: _page, ...rest } = query;
  return encodeInboxQuery(rest).toString().length === 0;
}

/**
 * Name of the URL param the reader uses to remember which filtered
 * inbox list the user came from, so its Back link can restore the
 * exact view they navigated away from.
 *
 * IMPORTANT: this MUST NOT collide with any InboxQuery key. The
 * earlier name `from` clashed with InboxQuery.from (the date-range
 * lower bound), which silently broke date-filtered URLs — see
 * tuliren/readtube#13 review comment 3068752681.
 */
export const RETURN_TO_PARAM = 'returnTo';

/**
 * The reader navigates to `/inbox/<videoId>?returnTo=<encoded-inbox-query>`
 * so the Back link can restore the exact filtered list the user came
 * from. Both the SSR pages and the client-side hooks need to look at
 * the inner query for filtering, not the wrapper `returnTo` param.
 *
 * This helper takes the raw URLSearchParams and returns either:
 *   - the URLSearchParams parsed from the `returnTo` value, if present, or
 *   - a copy of the original with `returnTo` stripped out, otherwise.
 *
 * Always returns a fresh URLSearchParams so callers can mutate it
 * without aliasing the React searchParams instance.
 */
export function extractInboxSearchParams(raw: URLSearchParams): URLSearchParams {
  const returnToValue = raw.get(RETURN_TO_PARAM);
  if (returnToValue != null && returnToValue.length > 0) {
    return new URLSearchParams(returnToValue);
  }
  const copy = new URLSearchParams(raw);
  copy.delete(RETURN_TO_PARAM);
  return copy;
}
