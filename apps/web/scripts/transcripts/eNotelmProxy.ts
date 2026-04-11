/**
 * Approach E — Proxy via notelm.ai's public API.
 *
 * Instead of hitting `www.youtube.com` directly, route the request through
 * a third-party site that has its own infrastructure (residential proxies,
 * cached results, etc.). `notelm.ai` exposes an unauthenticated endpoint
 * at `/api/youtube-transcript` that takes a YouTube URL and returns
 * `videoInfo` + available caption tracks + transcript content.
 *
 * It's the one free-tier site I found that has zero auth / no Cloudflare
 * Turnstile / no `x-is-human` challenge — raw `fetch` from a server
 * works directly.
 *
 * ## Flow
 *
 *   1. `POST {"url", "action":"list"}` — returns `videoInfo` + lists of
 *      available `subtitles` / `automaticCaptions` languages.
 *   2. `POST {"url", "action":"transcript", "lang":"en"}` — downloads the
 *      actual transcript for the given language as an array of segments.
 *
 * ## Caveats
 *
 * - **Still fails when notelm.ai's own backend is IP-blocked.** Empirically
 *   (from the Claude agent sandbox), the `list` call succeeds and returns
 *   video metadata for every video tested, BUT the `subtitles` and
 *   `automaticCaptions` lists are often empty and the `transcript` action
 *   returns `Failed to fetch subtitle content: 429` — i.e. notelm.ai's
 *   server is getting the same YouTube 429 that kills Approaches A-D.
 * - **Rate-limited and public.** Expect to get blocked if you hit it hard.
 *   Not suitable as the primary production path for a serious workload.
 * - **Zero SLA.** The endpoint is undocumented and can change or
 *   disappear at any time.
 *
 * Use as a **free fallback** when the direct approaches return empty,
 * NOT as a primary mechanism.
 */
import {
  Timer,
  type TranscriptSegment,
  ensureDevEnv,
  parseArgs,
  printResult,
  setupProxyIfNeeded,
  writeResult,
} from './shared';

const ENDPOINT = 'https://www.notelm.ai/api/youtube-transcript';

interface NotelmListResponse {
  subtitles: Record<string, unknown[]>;
  automaticCaptions: Record<string, unknown[]>;
  videoInfo?: {
    id: string;
    title?: string;
    author?: string;
    duration?: number;
    description?: string;
  };
  availableLanguages?: { code: string; name: string }[];
  error?: string;
}

interface NotelmTranscriptResponse {
  videoInfo?: NotelmListResponse['videoInfo'];
  // The transcript may come back under one of a few keys. We normalize
  // them to `segments` below.
  entries?: { start?: number; dur?: number; text: string }[];
  segments?: { start?: number; duration?: number; text: string }[];
  text?: string;
  error?: string;
}

async function callNotelm<T>(
  body: Record<string, unknown>
): Promise<{ response: T; bytes: number }> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://www.notelm.ai',
      Referer: 'https://www.notelm.ai/youtube-transcript-generator',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  const bytes = Buffer.byteLength(text, 'utf-8');

  // notelm returns JSON for both success and error cases. Allow 404/500
  // to fall through so we can surface their `error` field.
  let parsed: T;
  try {
    parsed = JSON.parse(text) as T;
  } catch {
    throw new Error(`notelm returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  return { response: parsed, bytes };
}

(async () => {
  ensureDevEnv();
  await setupProxyIfNeeded();
  const { videoId } = parseArgs();

  const timer = new Timer();
  let bytesTransferred = 0;

  // Stage 1: list available languages
  const { response: listResp, bytes: listBytes } = await callNotelm<NotelmListResponse>({
    url: `https://www.youtube.com/watch?v=${videoId}`,
    action: 'list',
  });
  bytesTransferred += listBytes;
  timer.mark('list');

  const subtitleLangs = Object.keys(listResp.subtitles ?? {});
  const autoLangs = Object.keys(listResp.automaticCaptions ?? {});
  console.info(
    `[approach-e] available: ${subtitleLangs.length} manual, ${autoLangs.length} auto-generated`
  );

  if (subtitleLangs.length === 0 && autoLangs.length === 0) {
    throw new Error(
      'notelm.ai returned no caption tracks. This usually means its upstream is getting ' +
        'rate-limited / IP-blocked by YouTube (same root cause as approaches A-D). ' +
        'Try again later or from a different IP.'
    );
  }

  const lang =
    subtitleLangs.find((l) => l.startsWith('en')) ??
    autoLangs.find((l) => l.startsWith('en')) ??
    subtitleLangs[0] ??
    autoLangs[0];

  // Stage 2: fetch transcript for chosen language
  const { response: txResp, bytes: txBytes } = await callNotelm<NotelmTranscriptResponse>({
    url: `https://www.youtube.com/watch?v=${videoId}`,
    action: 'transcript',
    lang,
  });
  bytesTransferred += txBytes;
  timer.mark('transcript');

  if (txResp.error != null) {
    throw new Error(`notelm.ai error: ${txResp.error}`);
  }

  const segments: TranscriptSegment[] = normalizeSegments(txResp);
  if (segments.length === 0) {
    throw new Error('notelm.ai returned no segments in the transcript response.');
  }

  const result = {
    approach: 'e-notelm-proxy',
    videoId,
    title: listResp.videoInfo?.title ?? txResp.videoInfo?.title,
    channel: listResp.videoInfo?.author ?? txResp.videoInfo?.author,
    language: lang,
    languageName: lang,
    captionType: (subtitleLangs.includes(lang) ? 'manual' : 'auto-generated') as
      | 'manual'
      | 'auto-generated',
    segmentCount: segments.length,
    segments,
    timings: timer.stagesFromMarks(),
    bytesTransferred,
  };

  printResult(result);
  const out = writeResult(result);
  console.info(`\nWrote: ${out}`);
})().catch((err: Error) => {
  console.error('\n[approach-e] FAILED:', err.message);
  process.exit(1);
});

function normalizeSegments(resp: NotelmTranscriptResponse): TranscriptSegment[] {
  if (Array.isArray(resp.segments)) {
    return resp.segments.map((s) => ({
      startMs: Math.round((s.start ?? 0) * 1000),
      endMs: Math.round(((s.start ?? 0) + (s.duration ?? 0)) * 1000),
      text: s.text,
    }));
  }
  if (Array.isArray(resp.entries)) {
    return resp.entries.map((s) => ({
      startMs: Math.round((s.start ?? 0) * 1000),
      endMs: Math.round(((s.start ?? 0) + (s.dur ?? 0)) * 1000),
      text: s.text,
    }));
  }
  if (typeof resp.text === 'string') {
    // Plain-text response with no timing info. Return a single segment.
    return [{ startMs: 0, endMs: 0, text: resp.text }];
  }
  return [];
}
