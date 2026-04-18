/**
 * Neutral snapshot shape shared across video platforms. Persisted by
 * the add-video workflow regardless of which platform produced it.
 * Keep in sync with `VideoSnapshot` as originally defined in
 * lib/youtube/videoSnapshot.ts — that file now re-exports from here.
 */
export interface VideoSnapshot {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  /** Null if the platform didn't expose a parseable publish date. */
  publishedAt: Date | null;
  /** Null if the platform didn't expose a duration. */
  durationSeconds: number | null;
  channel: {
    sourceId: string;
    name: string;
    /**
     * Channel handle (e.g. "@mkbhd") with the leading `@` for
     * YouTube, or null for platforms without a handle convention.
     */
    handle: string | null;
    logoUrl: string | null;
  };
}

/**
 * A single ingest-ready video inside a ChannelSnapshot. Platform-neutral
 * superset of what the add-channel flow needs to persist. `link` is the
 * canonical watch URL (YouTube distinguishes /watch vs /shorts; Bilibili
 * always uses /video/<bvid>/).
 */
export interface SnapshotVideo {
  videoId: string;
  title: string;
  description: string;
  /**
   * Null when the upstream source (RSS, TranscriptAPI, channel-page
   * scrape) fails to expose a parseable publish date. Callers upsert
   * null as-is; a later fetch that does return a date will backfill
   * the column via the upsert update branch.
   */
  publishedAt: Date | null;
  link: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
}

/**
 * Neutral channel-snapshot shape. Produced by
 * `VideoPlatform.fetchChannelSnapshot(sourceId)` and consumed by
 * `upsertChannelWithVideos` + the refresh-channels workflow.
 */
export interface ChannelSnapshot {
  /** Platform-native channel id — UC-prefixed for YouTube, numeric mid for Bilibili. */
  channelId: string;
  name: string;
  /** YouTube @handle. Null for Bilibili (no handle convention). */
  handle: string | null;
  /** Channel avatar. Null if the platform didn't expose one. */
  logoUrl: string | null;
  /** Shorts (YouTube) are filtered out. Ordered newest-first. */
  videos: SnapshotVideo[];
}
