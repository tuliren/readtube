/**
 * Approach D — youtubei.js library with `getTranscript()`.
 *
 * Uses the InnerTube `/youtubei/v1/get_transcript` endpoint (via
 * `youtubei.js`). Unlike the timedtext endpoint, this returns pre-grouped
 * transcript segments in a structured JSON response — the same data that
 * powers the "Show transcript" UI button on the watch page.
 *
 * Pros:
 * - Single structured response, no XML/json3 parsing.
 * - Segments are already cleaned and de-duplicated by YouTube.
 * - Goes through `/youtubei/v1/*` rather than the unsigned timedtext
 *   endpoint, which may have different bot-protection characteristics.
 *
 * Cons:
 * - `/get_transcript` requires a protobuf `params` blob that's annoying
 *   to construct by hand, so we lean on `youtubei.js` to build it.
 * - When the IP is bot-blocked this endpoint returns HTTP 400
 *   FAILED_PRECONDITION instead of empty — at least we get a clear error.
 */
import { Innertube } from 'youtubei.js';

import {
  Timer,
  type TranscriptSegment,
  ensureDevEnv,
  parseArgs,
  printResult,
  setupProxyIfNeeded,
  writeResult,
} from './shared';

(async () => {
  ensureDevEnv();
  await setupProxyIfNeeded();
  const { videoId } = parseArgs();

  const timer = new Timer();

  const yt = await Innertube.create();
  timer.mark('innertube-init');

  const info = await yt.getInfo(videoId);
  timer.mark('get-info');

  const title = info.basic_info.title ?? undefined;
  const channel = info.basic_info.author ?? undefined;

  const transcriptData = await info.getTranscript();
  timer.mark('get-transcript');

  // The result is a nested structure (TranscriptEntry/Section/etc). We
  // drill down to the flat `initial_segments` list and flatten to our
  // uniform shape.
  const rawSegments =
    (
      transcriptData as unknown as {
        transcript?: {
          content?: {
            body?: {
              initial_segments?: unknown[];
            };
          };
        };
      }
    ).transcript?.content?.body?.initial_segments ?? [];

  const segments: TranscriptSegment[] = (rawSegments as unknown[])
    .filter((s): s is { type?: string } => (s as { type?: string }).type === 'TranscriptSegment')
    .map((s) => {
      const seg = s as { start_ms: string; end_ms: string; snippet?: { text?: string } };
      return {
        startMs: Number(seg.start_ms),
        endMs: Number(seg.end_ms),
        text: seg.snippet?.text ?? '',
      };
    })
    .filter((seg) => seg.text.length > 0);

  const result = {
    approach: 'd-youtubei-get-transcript',
    videoId,
    title,
    channel,
    // get_transcript doesn't expose language metadata; use whichever the
    // user has selected via yt.session (defaults to "en").
    language: 'auto',
    languageName: 'auto-selected',
    captionType: 'auto-generated' as const,
    segmentCount: segments.length,
    segments,
    timings: timer.stagesFromMarks(),
  };

  printResult(result);
  const out = writeResult(result);
  console.info(`\nWrote: ${out}`);
})().catch((err: Error) => {
  console.error('\n[approach-d] FAILED:', err.message);
  process.exit(1);
});
