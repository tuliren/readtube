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
