import type { VideoPlatformType } from '@readtube/database';

import type { TranscriptSegment } from '@/lib/subtitles/types';

import type { VideoSnapshot } from './types';

export interface PlatformTranscriptResult {
  segments: TranscriptSegment[];
  language: string;
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

  /** Parse a platform-specific video id from the input, or null. */
  abstract extractVideoId(input: string): string | null;

  /** Fetch full metadata for persisting a Video + owning Channel row. */
  abstract fetchVideoSnapshot(videoId: string): Promise<VideoSnapshot>;

  /** Fetch the transcript for an existing video. */
  abstract fetchTranscript(videoId: string): Promise<PlatformTranscriptResult>;

  /**
   * RSS feed URL for the owning channel, or null if the platform has
   * no native RSS concept. Used only when creating a new Channel row.
   */
  abstract buildRssUrl(channelSourceId: string): string | null;
}
