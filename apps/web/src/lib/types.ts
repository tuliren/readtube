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
  channelId: string;
  channelName: string;
  channelSourceId: string;
  // Triage flags (Stream A)
  isStarred: boolean;
  isSaved: boolean;
  isArchived: boolean;
  snoozedUntil: string | null;
  // Tags + notes count (Stream 0 decorates, Streams A/D populate)
  tags: TagData[];
  noteCount: number;
}

export interface SavedViewData {
  id: string;
  name: string;
  query: InboxQuery;
  createdAt: string;
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
  includeSnoozed?: boolean;
  from?: string;
  to?: string;
  sort?: 'newest' | 'oldest';
}
