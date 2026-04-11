/**
 * Approach A — Direct InnerTube API call.
 *
 * POSTs to `https://www.youtube.com/youtubei/v1/player` with a minimal
 * client context (no library dependencies). The response contains
 * `videoDetails` + `captions.playerCaptionsTracklistRenderer.captionTracks`.
 * Then fetches each chosen track's `baseUrl` with `fmt=json3`.
 *
 * Pros:
 * - Zero library dependencies; ~80 lines of code.
 * - Single round-trip for metadata; one extra for the caption blob.
 * - Works on Vercel / serverless as long as the IP isn't bot-blocked.
 *
 * Cons:
 * - InnerTube client quirks (sometimes returns LOGIN_REQUIRED for certain
 *   clients from datacenter IPs). This script tries WEB first, then
 *   ANDROID as a fallback — identical to what `youtube-transcript` does.
 * - The request body format is un-documented and can break without notice.
 */
import {
  type CaptionTrack,
  Timer,
  ensureDevEnv,
  fetchCaptionsAsJson3,
  parseArgs,
  printResult,
  setupProxyIfNeeded,
  writeResult,
} from './shared';

interface InnertubeClientSpec {
  clientName: string;
  clientVersion: string;
  userAgent: string;
}

const CLIENTS: InnertubeClientSpec[] = [
  {
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
  },
  {
    clientName: 'IOS',
    clientVersion: '19.09.3',
    userAgent: 'com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)',
  },
  {
    clientName: 'WEB',
    clientVersion: '2.20240101.00.00',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
];

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { title?: string; author?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: {
        baseUrl: string;
        languageCode: string;
        kind?: string;
        name?: { simpleText?: string; runs?: { text: string }[] };
      }[];
    };
  };
}

async function callInnertubePlayer(
  videoId: string,
  client: InnertubeClientSpec
): Promise<{ response: PlayerResponse; bytes: number }> {
  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': client.userAgent,
      'X-YouTube-Client-Name': '3',
      'X-YouTube-Client-Version': client.clientVersion,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: client.clientName,
          clientVersion: client.clientVersion,
          hl: 'en',
          gl: 'US',
        },
      },
      videoId,
    }),
  });

  if (!res.ok) {
    throw new Error(`InnerTube /player ${client.clientName} HTTP ${res.status}`);
  }
  const text = await res.text();
  return { response: JSON.parse(text) as PlayerResponse, bytes: Buffer.byteLength(text, 'utf-8') };
}

function toTracks(response: PlayerResponse): CaptionTrack[] {
  const raw = response.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return raw.map((t) => ({
    baseUrl: t.baseUrl,
    languageCode: t.languageCode,
    name: t.name?.simpleText ?? t.name?.runs?.[0]?.text ?? t.languageCode,
    kind: t.kind,
  }));
}

function pickNative(tracks: CaptionTrack[]): CaptionTrack {
  return tracks.find((t) => t.kind !== 'asr') ?? tracks[0];
}

(async () => {
  ensureDevEnv();
  await setupProxyIfNeeded();
  const { videoId } = parseArgs();

  const timer = new Timer();
  let bytesTransferred = 0;
  let lastError: unknown = null;
  let playerResponse: PlayerResponse | null = null;
  let successfulClient: string | null = null;

  for (const client of CLIENTS) {
    try {
      const { response, bytes } = await callInnertubePlayer(videoId, client);
      bytesTransferred += bytes;
      const status = response.playabilityStatus?.status;
      if (status != null && status !== 'OK') {
        lastError = new Error(
          `${client.clientName}: ${status} — ${response.playabilityStatus?.reason ?? ''}`
        );
        continue;
      }
      playerResponse = response;
      successfulClient = client.clientName;
      break;
    } catch (err) {
      lastError = err;
    }
  }

  timer.mark('player-fetch');

  if (playerResponse == null) {
    throw lastError ?? new Error('All InnerTube clients failed.');
  }
  console.info(`[approach-a] player ok via ${successfulClient}`);

  const title = playerResponse.videoDetails?.title;
  const channel = playerResponse.videoDetails?.author;
  const tracks = toTracks(playerResponse);
  if (tracks.length === 0) {
    throw new Error('No caption tracks in player response.');
  }

  const track = pickNative(tracks);
  console.info(
    `[approach-a] using track: ${track.name} (${track.languageCode}, ${track.kind ?? 'manual'})`
  );

  const { segments, bytes } = await fetchCaptionsAsJson3(track.baseUrl);
  bytesTransferred += bytes;
  timer.mark('caption-fetch');

  printResult({
    approach: 'a-innertube',
    videoId,
    title,
    channel,
    language: track.languageCode,
    languageName: track.name,
    captionType: track.kind === 'asr' ? 'auto-generated' : 'manual',
    segmentCount: segments.length,
    segments,
    timings: timer.stagesFromMarks(),
    bytesTransferred,
  });

  const out = writeResult({
    approach: 'a-innertube',
    videoId,
    title,
    channel,
    language: track.languageCode,
    languageName: track.name,
    captionType: track.kind === 'asr' ? 'auto-generated' : 'manual',
    segmentCount: segments.length,
    segments,
    timings: timer.stagesFromMarks(),
    bytesTransferred,
  });
  console.info(`\nWrote: ${out}`);
})().catch((err: Error) => {
  console.error('\n[approach-a] FAILED:', err.message);
  process.exit(1);
});
