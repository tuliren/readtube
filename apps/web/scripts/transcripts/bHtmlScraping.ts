/**
 * Approach B — HTML scraping of the /watch page.
 *
 * Fetches the full YouTube watch page HTML, extracts the
 * `ytInitialPlayerResponse` JSON blob embedded in the page, and reads the
 * caption tracks from there. Then fetches each chosen track's `baseUrl`.
 *
 * Pros:
 * - No InnerTube POST body reverse-engineering.
 * - Works as long as YouTube keeps embedding `ytInitialPlayerResponse` (it
 *   has been stable for years).
 *
 * Cons:
 * - Downloads the full ~1.5 MiB watch page just to extract a small JSON.
 * - Same IP bot-blocking risk as every other approach.
 * - HTML blob sometimes returns "Sign in to confirm you're not a bot"
 *   stub for datacenter IPs, in which case `ytInitialPlayerResponse` still
 *   exists but lacks caption tracks.
 */
import { extractJsonFromHtml, parseCaptionTracks, pickNativeTrack } from '@/lib/subtitles/helpers';

import {
  Timer,
  ensureDevEnv,
  fetchCaptionsAsJson3,
  parseArgs,
  printResult,
  setupProxyIfNeeded,
  writeResult,
} from './shared';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
};

(async () => {
  ensureDevEnv();
  await setupProxyIfNeeded();
  const { videoId } = parseArgs();

  const timer = new Timer();
  let bytesTransferred = 0;

  // Stage 1: fetch watch page HTML
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: BROWSER_HEADERS,
  });
  if (!pageRes.ok) {
    throw new Error(`watch page HTTP ${pageRes.status}`);
  }
  const html = await pageRes.text();
  bytesTransferred += Buffer.byteLength(html, 'utf-8');
  timer.mark('html-fetch');

  // Stage 2: extract and parse ytInitialPlayerResponse
  const playerResponse = extractJsonFromHtml(html, 'ytInitialPlayerResponse = ');
  if (playerResponse == null) {
    throw new Error('Could not locate ytInitialPlayerResponse in HTML.');
  }
  timer.mark('json-extract');

  const videoDetails = playerResponse.videoDetails as Record<string, unknown> | undefined;
  const title = videoDetails?.title as string | undefined;
  const channel = videoDetails?.author as string | undefined;

  const playability = playerResponse.playabilityStatus as Record<string, unknown> | undefined;
  const playabilityStatus = playability?.status as string | undefined;
  if (playabilityStatus != null && playabilityStatus !== 'OK') {
    const reason = playability?.reason as string | undefined;
    console.warn(`[approach-b] playabilityStatus=${playabilityStatus}: ${reason ?? ''}`);
  }

  const tracks = parseCaptionTracks(playerResponse);
  if (tracks.length === 0) {
    throw new Error(
      'No caption tracks found in ytInitialPlayerResponse — the page may be a ' +
        '"Sign in to confirm you\'re not a bot" stub (YouTube IP-block).'
    );
  }
  const track = pickNativeTrack(tracks);
  console.info(
    `[approach-b] using track: ${track.name} (${track.languageCode}, ${track.kind ?? 'manual'})`
  );

  // Stage 3: fetch caption blob
  const { segments, bytes } = await fetchCaptionsAsJson3(track.baseUrl);
  bytesTransferred += bytes;
  timer.mark('caption-fetch');

  const result = {
    approach: 'b-html-scraping',
    videoId,
    title,
    channel,
    language: track.languageCode,
    languageName: track.name,
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
  console.error('\n[approach-b] FAILED:', err.message);
  process.exit(1);
});
