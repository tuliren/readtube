/**
 * Approach C — youtubei.js library (caption tracks via timedtext).
 *
 * Uses the official-ish `youtubei.js` library to call the InnerTube
 * `/player` endpoint (which it does under the hood), extracts the
 * caption tracks from `info.captions.caption_tracks`, and fetches the
 * chosen track's `baseUrl` directly.
 *
 * This is the same end-state as Approach A, but lets the library handle
 * InnerTube context building, visitorData negotiation, and player
 * decryption. In practice the library is much more resilient to
 * InnerTube schema drift than a handwritten POST.
 *
 * Pros:
 * - Robust InnerTube negotiation (visitor data, client rotation).
 * - Auto-parses player / videoDetails.
 *
 * Cons:
 * - ~5 MiB runtime dependency.
 * - Still needs a residential IP to actually retrieve the caption blob.
 */
import { Innertube } from 'youtubei.js';

import {
  Timer,
  ensureDevEnv,
  fetchCaptionsAsJson3,
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
  let bytesTransferred = 0;

  // Stage 1: Innertube.create() performs an internal handshake that fetches
  // a visitorData cookie + caches the current InnerTube client config.
  const yt = await Innertube.create();
  timer.mark('innertube-init');

  // Stage 2: /player call — retrieves videoDetails + streamingData + captions.
  const info = await yt.getInfo(videoId);
  timer.mark('get-info');

  const title = info.basic_info.title ?? undefined;
  const channel = info.basic_info.author ?? undefined;

  const tracks = info.captions?.caption_tracks ?? [];
  if (tracks.length === 0) {
    throw new Error('No caption tracks found for this video.');
  }

  // Prefer manual captions over auto-generated (ASR).
  const chosen = tracks.find((t: { kind?: string }) => t.kind !== 'asr') ?? tracks[0];
  const track = chosen as {
    base_url: string;
    language_code: string;
    name?: { text?: string };
    kind?: string;
  };
  console.info(
    `[approach-c] using track: ${track.name?.text ?? '?'} (${track.language_code}, ${track.kind ?? 'manual'})`
  );

  // Stage 3: fetch the caption blob. We do this directly rather than
  // calling `info.getTranscript()` — the latter hits
  // `/youtubei/v1/get_transcript` (see Approach D) which is a different
  // endpoint with different bot-protection characteristics.
  const { segments, bytes } = await fetchCaptionsAsJson3(track.base_url);
  bytesTransferred += bytes;
  timer.mark('caption-fetch');

  const result = {
    approach: 'c-youtubei-captions',
    videoId,
    title,
    channel,
    language: track.language_code,
    languageName: track.name?.text ?? track.language_code,
    captionType: track.kind === 'asr' ? ('auto-generated' as const) : ('manual' as const),
    segmentCount: segments.length,
    segments,
    timings: timer.stagesFromMarks(),
    bytesTransferred,
  };

  printResult(result);
  const out = writeResult(result);
  console.info(`\nWrote: ${out}`);
})().catch((err: Error) => {
  console.error('\n[approach-c] FAILED:', err.message);
  process.exit(1);
});
