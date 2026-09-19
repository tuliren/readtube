import { RETURN_TO_PARAM } from './filter';

/**
 * Session-scoped scroll memory for the video list routes.
 *
 * The problem: opening a video is a route change (`/inbox` →
 * `/videos/<id>`), so the list unmounts and comes back scrolled to
 * the top. Native scroll restoration can't help — the list scrolls
 * an inner `overflow-y-auto` div, not the window — and encoding the
 * position in the URL would mean rewriting the query string on every
 * scroll frame.
 *
 * So the position lives in `sessionStorage` instead, keyed by the
 * list it belongs to (the same path+query the reader's Back link
 * returns to). Two pieces of state:
 *
 *   - positions: one entry per list key, written as the user scrolls.
 *   - the armed key: written by the reader when it opens, naming the
 *     list it will send the user back to. The next list to mount
 *     consumes it and restores only if the key is its own.
 *
 * The arming step is what keeps the restore scoped to a *return*.
 * Clicking "Inbox" in the sidebar from somewhere else has no armed
 * key, so it lands at the top, which is what the user expects from a
 * fresh navigation.
 */
export interface ListScrollPosition {
  /** `scrollTop` of the list container when the user left it. */
  offset: number;
  /** Video id of the row sitting at the top edge of the viewport, if
   *  the list had any rows. Restoring against a row instead of a raw
   *  pixel offset survives the list shifting under us — the common
   *  case being the video the user just read dropping out of an
   *  unread-filtered list while they were in the reader. */
  anchorId: string | null;
  /** Distance in px from the container's top edge to the anchor row's
   *  top edge. Negative when the anchor is scrolled partly out of view. */
  anchorOffset: number;
}

interface StoredEntry {
  key: string;
  position: ListScrollPosition;
}

const POSITIONS_STORAGE_KEY = 'readtube:list-scroll';
const ARMED_STORAGE_KEY = 'readtube:list-scroll-armed';

/**
 * How many list positions to keep. Every distinct filter, channel,
 * playlist, and page is its own key, so an afternoon of triage can
 * mint a lot of them. Entries are ordered least-recently-written
 * first and trimmed from the front — the lists a user actually
 * returns to are the ones they just left.
 */
const MAX_ENTRIES = 20;

/**
 * Canonical identity for a list. Both sides of the handshake
 * normalize through this so a key written by the reader (from its
 * `returnTo` param, which round-tripped through the URL) matches the
 * one the list computes from `usePathname()` + `useSearchParams()`.
 *
 * Normalization: percent-decode the path, drop `returnTo`, and sort
 * the remaining params so parameter order can't split one list into
 * two keys.
 */
export function normalizeListKey(pathAndQuery: string): string {
  const queryIndex = pathAndQuery.indexOf('?');
  const rawPath = queryIndex >= 0 ? pathAndQuery.slice(0, queryIndex) : pathAndQuery;
  const rawQuery = queryIndex >= 0 ? pathAndQuery.slice(queryIndex + 1) : '';

  const params = new URLSearchParams(rawQuery);
  params.delete(RETURN_TO_PARAM);
  params.sort();

  const path = rawPath
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        // Malformed escape (`%zz`) — keep the segment verbatim so the
        // key stays stable rather than throwing.
        return segment;
      }
    })
    .join('/');

  const qs = params.toString();
  return qs.length > 0 ? `${path}?${qs}` : path;
}

/**
 * sessionStorage throws in a few real situations — Safari private
 * mode, storage disabled by policy, quota exhaustion — and scroll
 * memory is never worth breaking a page over. Every access funnels
 * through these two helpers so a failure degrades to "list starts at
 * the top".
 */
function readStorage(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value == null) {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
    }
  } catch {
    // Ignore: the feature is an optimization, not a requirement.
  }
}

function isPosition(value: unknown): value is ListScrollPosition {
  if (value == null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ListScrollPosition>;
  return (
    typeof candidate.offset === 'number' &&
    Number.isFinite(candidate.offset) &&
    (candidate.anchorId == null || typeof candidate.anchorId === 'string') &&
    typeof candidate.anchorOffset === 'number' &&
    Number.isFinite(candidate.anchorOffset)
  );
}

function readEntries(): StoredEntry[] {
  const raw = readStorage(POSITIONS_STORAGE_KEY);
  if (raw == null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is StoredEntry =>
        entry != null &&
        typeof entry === 'object' &&
        typeof (entry as StoredEntry).key === 'string' &&
        isPosition((entry as StoredEntry).position)
    );
  } catch {
    return [];
  }
}

/** Record where the user is in `key`'s list, replacing any earlier entry. */
export function saveListScroll(key: string, position: ListScrollPosition): void {
  const entries = readEntries().filter((entry) => entry.key !== key);
  entries.push({ key, position });
  writeStorage(POSITIONS_STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
}

/** The remembered position for `key`, or null if we have none. */
export function readListScroll(key: string): ListScrollPosition | null {
  return readEntries().find((entry) => entry.key === key)?.position ?? null;
}

/**
 * Name the list the user is expected to come back to. Called by the
 * reader on open, with the same target its Back link points at.
 */
export function armListScrollRestore(key: string): void {
  writeStorage(ARMED_STORAGE_KEY, key);
}

/**
 * Read and clear the armed key. Clearing unconditionally (rather
 * than only on a match) keeps a stale arm — set by a reader the user
 * escaped sideways, via the sidebar say — from restoring a position
 * on some unrelated later visit.
 */
export function takeArmedListScrollKey(): string | null {
  const key = readStorage(ARMED_STORAGE_KEY);
  writeStorage(ARMED_STORAGE_KEY, null);
  return key;
}
