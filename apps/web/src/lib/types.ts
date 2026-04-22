export type VideoPlatform = 'YOUTUBE' | 'BILIBILI';

export interface ChannelData {
  id: string;
  sourceId: string;
  /** Owning platform — drives the external "Watch on X" / "Open
   *  channel on X" link and any other platform-specific rendering.
   *  Mirrors Channel.source_type. */
  platform: VideoPlatform;
  name: string;
  /** YouTube handle (e.g. `@mkbhd`). Null when the scraper hasn't
   *  captured one yet. Used to build nicer sidebar URLs. Bilibili
   *  has no handle convention — always null there. */
  handle: string | null;
  // Null for platforms without a native RSS feed (Bilibili).
  rssUrl: string | null;
  /** URL to the channel's logo/avatar. Populated from the
   *  TranscriptAPI /youtube/channel/latest endpoint for YouTube,
   *  and from the first video's `owner.face` for Bilibili. Null
   *  for channels that were added before this feature or whose
   *  metadata enrichment failed. */
  logoUrl: string | null;
  createdAt: string;
  unreadCount: number;
  folderId: string | null;
  priority: number;
  muteUntil: string | null;
}

export interface FolderData {
  id: string;
  name: string;
  sortOrder: number;
}

export interface VideoData {
  id: string;
  sourceId: string;
  /** Video platform — drives the "Watch on X" external link and
   *  thumbnail fallback behavior. Mirrors Video.source_type. */
  platform: VideoPlatform;
  title: string;
  description: string | null;
  /** ISO string, or null when the upstream scrape didn't expose a
   *  parseable publish date. UI should fall back to hiding the
   *  "X ago" indicator rather than inventing a timestamp. */
  publishedAt: string | null;
  readAt: string | null;
  // Length of the video in seconds, or null when the channel scraper
  // hasn't captured it yet (Shorts, ad slots, pre-backfill rows).
  durationSeconds: number | null;
  // URL to the video's thumbnail image (typically i.ytimg.com).
  thumbnailUrl: string | null;
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
  // YouTube channel handle (e.g. `@mkbhd`). Null when the scraper
  // hasn't captured one yet. Used to build the public share URL.
  channelHandle: string | null;
  // Triage flags
  isStarred: boolean;
  isSaved: boolean;
  isArchived: boolean;
  // True when this video has a StandaloneVideo row for the viewer —
  // i.e. it lives in the user's personal library (Videos sidebar).
  isStandalone: boolean;
  // Notes count
  noteCount: number;
}

/**
 * Canonical shape for filtering + sorting the inbox. Lives here (not in
 * filter.ts) so types.ts stays the one-stop shop for cross-file contracts.
 * The URL <-> object codec is in `@/lib/inbox/filter`.
 */
export interface InboxQuery {
  q?: string;
  /** Set server-side by `/channels/[slug]` to scope the inbox to a
   *  single channel. Not user-facing in the URL (the UI uses the
   *  canonical `/channels/[slug]` path instead). The client
   *  `InboxShell` injects it when building the `/api/videos` SWR
   *  fetch key so the server sees the same scope as SSR. */
  channelId?: string;
  folderId?: string;
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
  /**
   * Library scope discriminator. When set, the base set of videos
   * comes from the user's library membership instead of their
   * subscribed channels:
   *   - `standalone`: videos with a StandaloneVideo row and no
   *     PlaylistVideo membership in any of the user's playlists.
   *   - `playlist`: videos in the playlist identified by
   *     `playlistId` — the route handler enforces ownership.
   * Omitted for inbox + channel views.
   */
  library?: 'standalone' | 'playlist';
  /**
   * Required when `library === 'playlist'`. Ignored otherwise.
   * The `/api/videos` route handler verifies the playlist belongs
   * to the authenticated user.
   */
  playlistId?: string;
}
