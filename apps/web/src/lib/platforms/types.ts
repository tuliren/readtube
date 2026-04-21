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
  /**
   * True when this entry came from the channel-page scrape only — the
   * RSS feed (15-item window) didn't include it. Title/description are
   * truncated and `publishedAt` is approximate. Persist on create, but
   * skip the update branch so a later refresh can't overwrite better
   * data already stored from a previous RSS hit.
   */
  isBackfill?: boolean;
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

/** Platform-neutral transcript segment emitted by every platform's transcript fetcher. */
export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

/**
 * Typed error thrown by the subtitle/transcript fetchers so callers can
 * tell the difference between "this video has no captions" (permanent —
 * safe to flip the sticky transcript_unavailable flag on the Video
 * row) and "the upstream provider blipped" (transient — should NOT
 * permanently disable transcripts).
 *
 * The split lives at the throw site (the fetcher) because that's
 * where we have the HTTP response code in hand. Callers downstream
 * (ensureTranscript) just check `transient` to decide whether to
 * persist anything.
 */
export class SubtitleFetchError extends Error {
  /** True for retryable failures (network errors, 429 rate limit,
   *  5xx server errors, missing API key). False for "captions don't
   *  exist for this video" (404 / 410 / 422 / similar 4xx). */
  readonly transient: boolean;
  /** Upstream HTTP status code if known, undefined for network /
   *  config errors that never reached a response. */
  readonly status: number | undefined;

  constructor(message: string, opts: { transient: boolean; status?: number }) {
    super(message);
    this.name = 'SubtitleFetchError';
    this.transient = opts.transient;
    this.status = opts.status;
    // Required for `instanceof SubtitleFetchError` to work after TS
    // transpiles `extends Error` for an es5 target — without this
    // the prototype chain points at Error and discriminating in
    // ensureTranscript would silently fall through to "transient".
    Object.setPrototypeOf(this, SubtitleFetchError.prototype);
  }
}
