/**
 * Shared helpers for transcript-fetching experiment scripts.
 *
 * Each `transcripts/*.ts` script implements ONE approach to retrieving a
 * YouTube video transcript for free (no paid API, no YouTube auth). The goal
 * is to benchmark approaches and find the most efficient one to replace
 * the current paid `transcriptapi.com` dependency.
 */
import { program } from 'commander';
import fs from 'fs';
import path from 'path';

import { extractVideoId } from '@/lib/subtitles';

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface ApproachResult {
  approach: string;
  videoId: string;
  title?: string;
  channel?: string;
  language?: string;
  languageName?: string;
  captionType?: 'manual' | 'auto-generated';
  segmentCount: number;
  segments: TranscriptSegment[];
  /** Duration broken down per stage in ms. */
  timings: Record<string, number>;
  /** Total bytes downloaded across all HTTP requests. */
  bytesTransferred?: number;
}

/**
 * Node 18+ `fetch` does not honour `HTTPS_PROXY` / `HTTP_PROXY` env vars.
 * The scripts run through a corporate/dev proxy in some environments (e.g.
 * the sandbox used for Claude agent verification). This helper installs an
 * `undici` ProxyAgent as the global dispatcher when a proxy is configured.
 *
 * On Vercel/production, `HTTPS_PROXY` is unset and this is a no-op.
 */
export async function setupProxyIfNeeded(): Promise<void> {
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (proxy == null || proxy === '') {
    return;
  }
  const { ProxyAgent, setGlobalDispatcher } = await import('undici');
  setGlobalDispatcher(new ProxyAgent(proxy));
  console.info(`[proxy] Using HTTPS_PROXY=${proxy.replace(/:[^@]+@/, ':***@')}`);
}

export function ensureDevEnv(): void {
  if (process.env.SCRIPT_ENV !== 'development') {
    console.error('This script can only be run in development environment.');
    process.exit(1);
  }
}

export function parseArgs(): { videoId: string; url?: string } {
  program
    .option('--url <value>', 'YouTube video URL')
    .option('--id <value>', 'YouTube video ID')
    .parse(process.argv);

  const options = program.opts<{ url?: string; id?: string }>();

  if (options.url == null && options.id == null) {
    console.error('Error: either --url or --id is required.');
    process.exit(1);
  }

  const videoId = options.id ?? extractVideoId(options.url!);
  if (videoId == null) {
    console.error(`Error: could not extract video ID from URL: ${options.url}`);
    process.exit(1);
  }

  return { videoId, url: options.url };
}

export class Timer {
  private marks: Record<string, number> = {};
  private start: number;

  constructor() {
    this.start = performance.now();
  }

  mark(name: string): void {
    this.marks[name] = performance.now() - this.start;
  }

  stagesFromMarks(): Record<string, number> {
    const out: Record<string, number> = {};
    const entries = Object.entries(this.marks);
    let prev = 0;
    for (const [name, t] of entries) {
      out[name] = Math.round(t - prev);
      prev = t;
    }
    out.total = Math.round(prev);
    return out;
  }
}

export function printResult(result: ApproachResult): void {
  console.info('');
  console.info('=========================================');
  console.info(`approach     : ${result.approach}`);
  console.info(`videoId      : ${result.videoId}`);
  console.info(`title        : ${result.title ?? '(unknown)'}`);
  console.info(`channel      : ${result.channel ?? '(unknown)'}`);
  if (result.language != null) {
    console.info(
      `language     : ${result.languageName ?? result.language} (${result.language}) — ${result.captionType ?? '?'}`
    );
  }
  console.info(`segments     : ${result.segmentCount}`);
  if (result.bytesTransferred != null) {
    console.info(`bytes        : ${formatBytes(result.bytesTransferred)}`);
  }
  console.info('timings (ms) :');
  for (const [stage, ms] of Object.entries(result.timings)) {
    console.info(`  ${stage.padEnd(20)} ${ms}`);
  }
  console.info('=========================================');
  if (result.segments.length > 0) {
    console.info('\nFirst 5 segments:');
    for (const seg of result.segments.slice(0, 5)) {
      console.info(`  [${(seg.startMs / 1000).toFixed(2)}s] ${seg.text}`);
    }
  }
}

export function writeResult(result: ApproachResult): string {
  const outputDir = path.resolve(__dirname, '..', 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${result.approach}-${result.videoId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  return outputPath;
}

function formatBytes(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KiB`;
  }
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

/**
 * Shared caption-track descriptor (same shape for all approaches that go
 * through `/youtubei/v1/player`).
 */
export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name: string;
  kind?: string;
}

/**
 * A YouTube caption URL of format `fmt=json3` responds with a JSON document.
 * Parse it into our segment shape.
 *
 * Note: YouTube silently returns HTTP 200 with Content-Length 0 when the
 * requesting IP is flagged as a bot (common for datacenter / Vercel IPs).
 * This helper throws a clear error so callers can surface the failure mode.
 */
export async function fetchCaptionsAsJson3(baseUrl: string): Promise<{
  segments: TranscriptSegment[];
  bytes: number;
}> {
  const url = baseUrl.includes('fmt=') ? baseUrl : `${baseUrl}&fmt=json3`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) {
    throw new Error(`caption fetch failed: HTTP ${res.status}`);
  }

  const raw = await res.text();
  const bytes = Buffer.byteLength(raw, 'utf-8');

  if (raw.length === 0) {
    throw new Error(
      'caption fetch returned HTTP 200 with 0 bytes — this usually means YouTube has ' +
        'silently IP-blocked the request (typical for datacenter / serverless IPs). ' +
        'Try from a residential IP, or route through a residential proxy.'
    );
  }

  const data = JSON.parse(raw) as {
    events?: { tStartMs: number; dDurationMs?: number; segs?: { utf8: string }[] }[];
  };

  const segments = (data.events ?? [])
    .filter((e) => e.segs != null && e.segs.length > 0)
    .map((e) => ({
      startMs: e.tStartMs,
      endMs: e.tStartMs + (e.dDurationMs ?? 0),
      text: (e.segs ?? [])
        .map((s) => s.utf8)
        .join('')
        .trim(),
    }))
    .filter((seg) => seg.text.length > 0);

  return { segments, bytes };
}
