export const MAIN_COLOR = '#515ada';
export const MINOR_COLOR = '#76ABDF';

export const TITLE = 'ReadTube';
export const GITHUB_REPO_URL = 'https://github.com/tuliren/readtube';
export const DESCRIPTION =
  'Turn YouTube subscriptions into a personal newsletter. Reclaim focus in a world engineered for distraction.';
export const DOMAIN = 'read.tube';
export const FULL_WEBSITE_URL = `https://www.${DOMAIN}`;
export const CONTACT_EMAIL = `contact@${DOMAIN}`;

// https://vercel.com/liren/~/ai-gateway/models
// google/gemini-3.1-flash-lite-preview: $0.25 / $1.5 - tend to summarize for article too
// openai/gpt-5.4-nano: $0.20 / $1.25 - not much formatting for article
// openai/gpt-5.4-mini: $0.74 / $4.5
// openai/gpt-5.4: $2.5 / $15 - too expensive
// anthropic/claude-haiku-4.5: $1 / $5 - slow
export const DEFAULT_AI_MODEL = 'openai/gpt-5.6-luna';

/**
 * Model for semantic embeddings. 1536 native dims matches the pgvector
 * column in the schema. We use OpenAI for embeddings even though
 * generation (summaries, articles, Ask-my-inbox answers) uses Google
 * Gemini — the Vercel AI Gateway routes them independently by provider
 * prefix, and no 1536-dim Google embedding model is available through
 * the gateway as a plain string identifier today. If you swap to a
 * model with a different output size, bump EMBEDDING_PROMPT_VERSION
 * AND alter the pgvector column + HNSW index together.
 *
 * https://developers.openai.com/api/docs/pricing
 * $0.02
 */
export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small';

/**
 * Model for AI transcript generation of caption-less YouTube videos.
 * This is the NATIVE Gemini model id (no `google/` gateway prefix): the
 * transcript workflow calls the Google Generative Language API directly
 * (see `lib/ai/geminiVideo.ts`), NOT the Vercel AI Gateway.
 *
 * Why bypass the gateway: Gemini ingests a YouTube watch URL server-side
 * as a `fileData` part, but there is a hard length cap on URL ingestion
 * (~1 h) — longer videos silently come back with ZERO video tokens and
 * the model hallucinates from the title. The only fix is to clip the
 * video into windows via the per-part `video_metadata` start/end offset,
 * and the gateway does NOT forward that field (verified: a clipped
 * request through the gateway ingested 0 video tokens, while the same
 * clip through the native API ingested normally). Summaries/articles
 * still use the gateway (`DEFAULT_AI_MODEL`) over the transcript text.
 *
 * Pricing ≈ $0.75/M input, $3.75/M output ≈ $0.30 per video hour at
 * MEDIA_RESOLUTION_LOW. Requires `GEMINI_API_KEY`.
 */
export const TRANSCRIPT_GENERATION_MODEL = 'gemini-3.7-flash';

/** Base URL for the native Google Generative Language REST API. */
export const TRANSCRIPT_GENERATION_NATIVE_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta';

/**
 * Media resolution for video ingestion. LOW minimizes per-frame token
 * cost (frames are ~72% of input tokens and useless for transcription)
 * and, critically, stretches how much video fits under the ingestion
 * cap. Measured ingestion rate at LOW: ~5,460 video tokens per minute.
 */
export const TRANSCRIPT_GENERATION_MEDIA_RESOLUTION = 'MEDIA_RESOLUTION_LOW';

/**
 * Window size (seconds) for chunked video ingestion. Gemini's YouTube
 * URL ingestion caps out around ~1 h of video per request even at low
 * resolution (measured: a 54-min video ingests, a 2 h11 m video comes
 * back with zero video tokens). Longer videos are split into windows of
 * this size, each requested with a `video_metadata` start/end offset,
 * then stitched — the model returns absolute (original-video) timestamps
 * per window, so no offset math is needed.
 *
 * Beyond the ingestion cap, the window size bounds the collateral damage
 * from Gemini's content-policy filter: `PROHIBITED_CONTENT` blocks are
 * evaluated per request over the whole window, and a block drops that
 * window from the stitched transcript (see the generate step). The block
 * is content-localized (measured: a 45-min window blocked while its first
 * 15 min transcribed cleanly), so a smaller window confines the gap to
 * the offending stretch instead of losing 45 min. 20 min keeps the gap
 * small while staying far under the ingestion cap; total video tokens
 * ingested is independent of window size, so this does not raise cost.
 * Tunable.
 */
export const TRANSCRIPT_GENERATION_CHUNK_SECONDS = 20 * 60;

/**
 * Max windows generated concurrently within the generate step. Sized so
 * every window of a max-length video ({@link TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS})
 * runs in a single batch (⌈3 h / 20 min⌉ = 9), keeping wall-clock to
 * roughly one window and under the workflow's 800 s step budget. Total
 * simultaneous ingestion is unchanged from the previous 45-min/4-window
 * sizing (9 × 20 min ≈ 4 × 45 min of video in flight), so Gemini's
 * per-minute token quota sees the same pressure.
 */
export const TRANSCRIPT_GENERATION_MAX_PARALLEL_WINDOWS = 9;

/**
 * Output budget for a transcript generation. The model's ceiling is
 * 65,536, and we request all of it: a dense 54-min video measured
 * ~21.6k output tokens, so typical videos finish well under this even
 * near the 3-hour duration cap below. Only the densest long videos
 * reach the ceiling, where the parser's truncation salvage persists the
 * completed prefix rather than failing outright.
 */
export const TRANSCRIPT_GENERATION_MAX_OUTPUT_TOKENS = 65_536;

/**
 * Refuse to generate transcripts for videos longer than this.
 * Transcript output scales with speech (~24k tokens/hour measured on
 * dense Chinese speech), so a dense 3 h video (~72k tokens) can overrun
 * the 65,536 output-token ceiling; when it does, the parser's
 * truncation salvage persists the completed prefix. Most videos are far
 * less dense and finish comfortably under the ceiling. Fully covering
 * dense long videos needs chunked generation (videoMetadata start/end
 * offsets) — a follow-up if demand appears.
 */
export const TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS = 3 * 60 * 60;

/**
 * Abort a transcript generation that has produced no response for
 * this long. Measured latency for a 54-min video ranged 4–9 minutes,
 * so 700 s gives headroom for long videos while staying under the
 * workflow step's 800 s budget.
 */
export const TRANSCRIPT_GENERATION_TIMEOUT_MS = 700_000;

/**
 * Reject a generation whose prompt carried fewer input tokens than
 * this — the tell that Gemini never ingested the video and answered
 * from the text prompt alone, inventing a plausible but unrelated
 * transcript. The prompt text is ~150 tokens; a genuinely ingested
 * video adds ~5.5k input tokens per minute at MEDIA_RESOLUTION_LOW
 * (measured: 297k for a 54-min video, all VIDEO modality), so any real
 * ingestion clears this floor by a wide margin while the text-only
 * failure mode (~146 tokens) sits far below it. Rejection is retryable:
 * the miss is an intermittent server-side video-fetch failure, so a
 * fresh model call usually succeeds.
 */
export const TRANSCRIPT_GENERATION_MIN_INPUT_TOKENS = 1000;

/**
 * Reject a non-truncated generation that covers less than this fraction
 * of a video whose duration we know. A run that stops far short of the
 * end — the hallucinated 36-second "transcript" of a 2-hour video is
 * the pathological case — is treated as incomplete rather than
 * persisting a sliver. Skipped when the output hit the token ceiling
 * (finishReason 'length'), where a short prefix is expected and already
 * salvaged, and when duration is unknown. 0.5 is deliberately lenient:
 * it flags gross shortfalls while tolerating videos that legitimately
 * trail off into music or silence. Retryable, same as the token floor.
 */
export const TRANSCRIPT_GENERATION_MIN_COVERAGE_RATIO = 0.5;

/**
 * Maximum attempts (initial + retries) for `streamText` calls in
 * generation steps when nothing has been streamed to the client yet.
 * Once any delta has been emitted, retrying would re-stream content
 * the client already received, so the retry budget only applies to
 * pre-first-byte failures (gateway connect, TLS, early "fetch
 * failed").
 */
export const MAX_PRESTREAM_ATTEMPTS = 3;

/**
 * Inactivity watchdog: abort the model stream if no token has arrived
 * for this long. Long transcripts can stall mid-stream when the
 * gateway holds the connection open but stops forwarding data.
 * 90 s is well above normal token-gap variance.
 */
export const STREAM_INACTIVITY_TIMEOUT_MS = 90_000;

/**
 * Threshold (in minutes of source video duration) above which the
 * article workflow switches from the single-pass LLM strategy to the
 * map-reduce strategy. Below the threshold a single LLM call writes
 * the whole article. At/above the threshold the transcript is sliced
 * into ~{@link SECTION_TARGET_WORDS}-word chunks, each generated by
 * its own bounded LLM call, then assembled. ~30 min single-pass is
 * reliably fine; 60+ min starts dropping connections; 45 min is a
 * comfortable margin. Tunable — no other code changes needed.
 */
export const MAP_REDUCE_THRESHOLD_MINUTES = 20;

/**
 * Target word count per section in the map-reduce strategy. Sections
 * snap to transcript-segment boundaries, so actual sizes vary in the
 * [0.5×, 2×] range around the target ({@link MIN_SECTION_WORDS} /
 * {@link MAX_SECTION_WORDS}). ~600 words ≈ 4 min of typical speech —
 * small enough that even a 10-min video produces multiple sections,
 * which is the whole point of the map-reduce path.
 */
export const SECTION_TARGET_WORDS = 600;

/**
 * Sanity cap on map-reduce sections. With a 600-word target, a 15hr
 * (~135 k word) video produces ~225 sections; the cap accommodates
 * that with a little headroom while still bounding pathological cases.
 */
export const MAX_SECTIONS = 300;

/**
 * Bound on simultaneous in-flight section generations in map-reduce.
 * Higher means faster wall-clock for very long videos but more risk
 * of tripping the gateway's per-minute token quota; 10 keeps a
 * 60-section video to ~6 batches.
 */
export const MAX_PARALLEL_SECTIONS = 10;

/**
 * Word count for fine-grained "windows" used by the map-reduce
 * topic-boundary detector. ~250 words ≈ 90 s of typical speech, which
 * is short enough to embed cleanly but large enough that a single
 * window's content represents a coherent micro-topic.
 */
export const EMBED_WINDOW_WORDS = 250;

/** Batch size for `embedMany` calls when embedding windows. */
export const EMBED_BATCH_SIZE = 100;

/**
 * Minimum and maximum word counts for a map-reduce section, derived
 * from {@link SECTION_TARGET_WORDS} so a single knob tunes sizing.
 * The topic-boundary detector cuts at high cosine-distance boundaries
 * once min is reached, and force-cuts at max regardless of semantic
 * signal — important for single-topic monologues / lectures where
 * adjacent windows never cross {@link TOPIC_BOUNDARY_DISTANCE}.
 *
 * 0.5× / 2× tolerance around the target gives sections that are
 * substantive enough not to fragment trivially, but never balloon to
 * the point where one section dominates the LLM context for the
 * map step.
 */
export const MIN_SECTION_WORDS = Math.floor(SECTION_TARGET_WORDS * 0.5);
export const MAX_SECTION_WORDS = SECTION_TARGET_WORDS * 2;

/**
 * Cosine-distance threshold above which a window-pair boundary
 * counts as a topic shift. Picked for `text-embedding-3-small`:
 * within-topic adjacent windows typically sit at 0.1–0.3, across-topic
 * shifts at 0.4+. Tunable; raise to be more conservative (fewer cuts,
 * larger sections) or lower for finer-grained sections.
 */
export const TOPIC_BOUNDARY_DISTANCE = 0.4;
