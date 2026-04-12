import type { InboxQuery } from '@/lib/types';

/**
 * Metadata about an "inbox view" — the named buckets users can land
 * in via the sidebar (Inbox / Starred / Read Later / Snoozed /
 * Archived). Centralized so the sidebar entries, the header label,
 * and the contextual empty-state message all read from one source.
 *
 * Each view definition carries:
 *   - `key`: stable identifier for switch statements + tests
 *   - `label`: title to render in the inbox header and the sidebar
 *   - `query`: the InboxQuery shape that activates this view
 *   - `emptyMessage`: shown by VideoList when the view has zero rows.
 *     The default Inbox copy points the user at the next refresh; the
 *     filter views talk about the bucket itself, since "wait for new
 *     videos" doesn't apply to them (an empty Starred bucket isn't
 *     waiting on anything — it's just empty until the user stars
 *     something).
 */
export interface InboxViewDef {
  key: 'inbox' | 'starred' | 'saved' | 'snoozed' | 'archived';
  label: string;
  query: Partial<InboxQuery>;
  emptyMessage: string;
}

export const INBOX_VIEWS: InboxViewDef[] = [
  {
    key: 'inbox',
    label: 'Inbox',
    query: {},
    emptyMessage: 'No videos yet. New videos will appear here after the next refresh.',
  },
  {
    key: 'starred',
    label: 'Starred',
    query: { starred: true },
    emptyMessage: 'No starred videos yet. Star a video to keep it in this view.',
  },
  {
    key: 'saved',
    label: 'Read Later',
    query: { saved: true },
    emptyMessage: 'Nothing saved for later yet. Save a video to read it here.',
  },
  {
    key: 'snoozed',
    label: 'Snoozed',
    query: { snoozed: true },
    emptyMessage: 'No snoozed videos right now. Snoozed videos appear here until they wake up.',
  },
  {
    key: 'archived',
    label: 'Archived',
    query: { archived: true },
    emptyMessage: 'No archived videos. Archive a video to hide it from the inbox.',
  },
];

/**
 * Resolve the active view from an InboxQuery, in declaration order.
 *
 * The named filter buckets (Starred / Read Later / Snoozed /
 * Archived) win over the default Inbox view when their flag is set.
 * Returns null when nothing matches — that's the case for free-text
 * search, custom saved-view jumps, or any combination of filter
 * chips that doesn't line up exactly with one of the named views;
 * callers should fall back to a generic label in that case.
 */
export function resolveInboxView(query: InboxQuery): InboxViewDef | null {
  // Walk in reverse so the named filter views beat the empty Inbox
  // catch-all. The Inbox view's query is `{}` which trivially
  // matches every other query as a subset, so it must be checked
  // last — and only when it's the actual default state.
  const namedViews = INBOX_VIEWS.filter((v) => v.key !== 'inbox');
  for (const view of namedViews) {
    if (matchesView(query, view.query)) {
      return view;
    }
  }
  // Fall back to Inbox iff the query is genuinely the default. We
  // don't want to claim a free-text search or a tag filter as
  // "Inbox" — that would mislead the user about what they're
  // looking at.
  if (isPlainInbox(query)) {
    return INBOX_VIEWS[0];
  }
  return null;
}

function matchesView(query: InboxQuery, viewQuery: Partial<InboxQuery>): boolean {
  for (const [key, value] of Object.entries(viewQuery)) {
    if (query[key as keyof InboxQuery] !== value) {
      return false;
    }
  }
  return true;
}

function isPlainInbox(query: InboxQuery): boolean {
  // The default state — no triage flags, no search, no date window,
  // no tag filter, no channel narrow, default sort.
  if (query.starred === true) {
    return false;
  }
  if (query.saved === true) {
    return false;
  }
  if (query.snoozed === true) {
    return false;
  }
  if (query.archived === true) {
    return false;
  }
  if (query.unread === true) {
    return false;
  }
  if (query.includeSnoozed === true) {
    return false;
  }
  if (query.q != null && query.q.length > 0) {
    return false;
  }
  if (query.channelId != null) {
    return false;
  }
  if (query.folderId != null) {
    return false;
  }
  if (query.from != null) {
    return false;
  }
  if (query.to != null) {
    return false;
  }
  if (query.tagIds != null && query.tagIds.length > 0) {
    return false;
  }
  if (query.sort != null && query.sort !== 'newest') {
    return false;
  }
  return true;
}
