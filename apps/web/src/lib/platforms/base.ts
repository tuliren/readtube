import type { VideoPlatformType } from '@readtube/database';

import type { TranscriptSegment } from '@/lib/platforms/types';

import type { ChannelSnapshot, VideoSnapshot } from './types';

export interface PlatformTranscriptResult {
  segments: TranscriptSegment[];
  language: string;
}

/**
 * Result of `fetchVideoSnapshot`. Carries the persistable `VideoSnapshot`
 * plus an optional pre-fetched transcript that the upstream call
 * happened to bundle in the same response. Currently only the
 * YouTube TranscriptAPI fallback path produces a non-null
 * `prefetchedTranscript` — the add-video workflow persists it when
 * present so the reader doesn't immediately re-spend a credit on
 * `/api/videos/<id>/transcript`.
 */
export interface VideoSnapshotResult {
  snapshot: VideoSnapshot;
  prefetchedTranscript: PlatformTranscriptResult | null;
}

/**
 * Abstract base class for a video platform (YouTube, Bilibili, ...).
 * Concrete subclasses wrap the existing per-platform function modules
 * (`lib/youtube/*`, `lib/bilibili/*`). The subclasses never duplicate
 * logic; they're purely dispatch glue so callers can ask "for this
 * URL / video row, what should I call?" in one place.
 */
export abstract class VideoPlatform {
  abstract readonly type: VideoPlatformType;

  /** True if this platform recognizes the URL / bare-id input. */
  abstract matchesUrl(input: string): boolean;

  /**
   * True if the given bare `source_id` (as stored on Video.source_id)
   * belongs to this platform. Used when the URL only carries the id
   * — the `/videos/<sourceId>` reader route, the mobile-meta API —
   * so the caller can pick the right `source_type` for the DB lookup
   * without first fetching the row.
   */
  abstract matchesSourceId(sourceId: string): boolean;

  /** Parse a platform-specific video id from the input, or null. */
  abstract extractVideoId(input: string): string | null;

  /**
   * Sync-parse a channel source_id from a channel URL or bare id.
   * Returns null when resolution requires a network call (e.g. a
   * YouTube @handle URL needs a scrape to discover the UC id) — the
   * add-channel route handles that fallback explicitly.
   */
  abstract extractChannelSourceId(input: string): string | null;

  /** Fetch full metadata for persisting a Video + owning Channel row. */
  abstract fetchVideoSnapshot(videoId: string): Promise<VideoSnapshotResult>;

  /**
   * Fetch channel metadata + recent videos for a given channel
   * `source_id` (UC-prefixed for YouTube, numeric mid for Bilibili).
   * Used by the refresh-channels cron and by the add-channel flow once
   * the caller has resolved the canonical source id.
   */
  abstract fetchChannelSnapshot(channelSourceId: string): Promise<ChannelSnapshot>;

  /** Fetch the transcript for an existing video. */
  abstract fetchTranscript(videoId: string): Promise<PlatformTranscriptResult>;

  /**
   * Best-effort probe for "is this video a scheduled premiere /
   * upcoming livestream that hasn't aired yet?" Called by
   * `ensureTranscript` right before flipping the sticky
   * transcript-unavailable flag, so a future-dated video that
   * happens to fail the transcript fetch isn't permanently locked
   * out of the reader.
   *
   * Returns `{ isScheduled: false }` when the platform doesn't
   * support the concept, or when the probe is inconclusive.
   * `scheduledStartTime` is best-effort and may be null even when
   * `isScheduled` is true.
   */
  isScheduledVideo(
    _videoId: string,
    _opts: { channelSourceId?: string | null } = {}
  ): Promise<{ isScheduled: boolean; scheduledStartTime: Date | null }> {
    return Promise.resolve({ isScheduled: false, scheduledStartTime: null });
  }

  /**
   * RSS feed URL for the owning channel, or null if the platform has
   * no native RSS concept. Used only when creating a new Channel row.
   */
  abstract buildRssUrl(channelSourceId: string): string | null;
}
