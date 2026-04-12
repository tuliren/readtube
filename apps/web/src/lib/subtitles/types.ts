export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name: string;
  /** "asr" = auto-generated; absent = manual */
  kind?: string;
}

/** Internal shape of a timed-text event returned by YouTube's timedtext endpoint. */
export interface CaptionEvent {
  tStartMs: number;
  dDurationMs?: number;
  segs?: { utf8: string }[];
}

export interface SubtitleResult {
  videoId: string;
  title: string;
  channel: string;
  language: string;
  languageName: string;
  captionType: 'manual' | 'auto-generated';
  segmentCount: number;
  segments: TranscriptSegment[];
}

/**
 * Typed error thrown by the subtitle fetchers so callers can tell
 * the difference between "this video has no captions" (permanent —
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
