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
