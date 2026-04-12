export interface ChannelData {
  id: string;
  sourceId: string;
  name: string;
  rssUrl: string;
  createdAt: string;
  unreadCount: number;
  folderId: string | null;
  priority: number;
  muteUntil: string | null;
}

export interface TagData {
  id: string;
  name: string;
  color: string | null;
}

export interface FolderData {
  id: string;
  name: string;
  sortOrder: number;
}

export interface VideoData {
  id: string;
  sourceId: string;
  title: string;
  description: string | null;
  publishedAt: string;
  readAt: string | null;
  // Length of the video in seconds, or null when the channel scraper
  // hasn't captured it yet (Shorts, ad slots, pre-backfill rows).
  durationSeconds: number | null;
  // Sticky "we've already tried and there's nothing here" flag set on
  // the Video row when a transcript fetch came back empty. Used by the
  // reader to skip retry attempts and to disable Generate buttons in
  // Summary / Article when there's nothing to feed them.
  transcriptUnavailable: boolean;
  // Whether the latest transcript fetch produced cached segments (i.e.
  // there's at least one Transcript row for the video). Used by
  // VideoRow to render the artifact-presence badges.
  hasTranscript: boolean;
  // Whether a Summary row exists for the latest transcript.
  hasSummary: boolean;
  // Whether at least one Article row exists for the latest transcript.
  hasArticle: boolean;
  channelId: string;
  channelName: string;
  channelSourceId: string;
  // Triage flags
  isStarred: boolean;
  isSaved: boolean;
  isArchived: boolean;
  // Tags + notes count
  tags: TagData[];
  noteCount: number;
}

/**
 * Canonical shape for filtering + sorting the inbox. Lives here (not in
 * filter.ts) so types.ts stays the one-stop shop for cross-file contracts.
 * The URL <-> object codec is in `@/lib/inbox/filter`.
 */
export interface InboxQuery {
  q?: string;
  channelId?: string;
  folderId?: string;
  tagIds?: string[];
  unread?: boolean;
  starred?: boolean;
  saved?: boolean;
  archived?: boolean;
  from?: string;
  to?: string;
  sort?: 'newest' | 'oldest';
  /**
   * 1-indexed page number for the paginated video list. Default is
   * page 1 when omitted. Encoded into the URL via the InboxQuery
   * codec; the codec drops it on encode when it equals 1, so the
   * default state is still a clean URL.
   */
  page?: number;
}
