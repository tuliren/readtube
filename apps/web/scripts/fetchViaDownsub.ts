/**
 * Fetch YouTube subtitles via downsub.com's public API (no API key needed).
 *
 * Flow:
 *   1. Encrypt the video ID with CryptoJS AES (passphrase mode).
 *   2. GET  https://get-info.downsub.com/{encrypted_id}
 *      → returns video metadata + list of subtitle tracks (each with an
 *        encrypted timedtext URL).
 *   3. GET  https://subtitle.downsub.com/{format}/{encrypted_subtitle_url}/
 *      → returns the subtitle content in the requested format (txt, srt, raw).
 *
 * Usage:
 *   npm run script -- development fetchViaDownsub.ts --id XIhc7_Ptrpk
 *   npm run script -- development fetchViaDownsub.ts --url "https://www.youtube.com/watch?v=XIhc7_Ptrpk"
 *   npm run script -- development fetchViaDownsub.ts --id XIhc7_Ptrpk --lang chinese --format srt
 */
import { program } from 'commander';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { extractVideoId } from '@/lib/subtitles';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

// ── CryptoJS-compatible AES helpers ──────────────────────────────────────────
// CryptoJS passphrase mode uses OpenSSL's EVP_BytesToKey with MD5 + a random
// 8-byte salt to derive a 256-bit key + 128-bit IV, then AES-CBC encrypts.

const PASSPHRASE = 'zthxw34cdp6wfyxmpad38v52t3hsz6c5';

function evpBytesToKey(
  password: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  keyLen: number,
  ivLen: number
): { key: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer> } {
  const totalLen = keyLen + ivLen;
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let partsLen = 0;
  let prev = new Uint8Array(0) as Uint8Array<ArrayBuffer>;
  while (partsLen < totalLen) {
    const hash = crypto.createHash('md5');
    hash.update(prev);
    hash.update(password);
    hash.update(salt);
    prev = new Uint8Array(hash.digest()) as Uint8Array<ArrayBuffer>;
    parts.push(prev);
    partsLen += prev.length;
  }
  const derived = new Uint8Array(partsLen) as Uint8Array<ArrayBuffer>;
  let offset = 0;
  for (const part of parts) {
    derived.set(part, offset);
    offset += part.length;
  }
  return {
    key: new Uint8Array(derived.buffer, 0, keyLen) as Uint8Array<ArrayBuffer>,
    iv: new Uint8Array(derived.buffer, keyLen, ivLen) as Uint8Array<ArrayBuffer>,
  };
}

function encryptAesCryptoJS(plaintext: string, passphrase: string): string {
  const salt = new Uint8Array(crypto.randomBytes(8)) as Uint8Array<ArrayBuffer>;
  const pw = new Uint8Array(Buffer.from(passphrase, 'utf8')) as Uint8Array<ArrayBuffer>;
  const { key, iv } = evpBytesToKey(pw, salt, 32, 16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encA = cipher.update(plaintext, 'utf8');
  const encB = cipher.final();
  const encrypted = Buffer.concat([
    new Uint8Array(encA),
    new Uint8Array(encB),
  ] as Uint8Array<ArrayBuffer>[]);

  const result = {
    ct: encrypted.toString('base64'),
    iv: Buffer.from(iv).toString('hex'),
    s: Buffer.from(salt).toString('hex'),
  };
  return Buffer.from(JSON.stringify(result)).toString('base64');
}

function decryptAesCryptoJS(b64: string, passphrase: string): string {
  const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  const ct = new Uint8Array(Buffer.from(json.ct, 'base64')) as Uint8Array<ArrayBuffer>;
  const salt = new Uint8Array(Buffer.from(json.s, 'hex')) as Uint8Array<ArrayBuffer>;
  const pw = new Uint8Array(Buffer.from(passphrase, 'utf8')) as Uint8Array<ArrayBuffer>;
  const { key, iv } = evpBytesToKey(pw, salt, 32, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decA = decipher.update(ct);
  const decB = decipher.final();
  return Buffer.concat([
    new Uint8Array(decA),
    new Uint8Array(decB),
  ] as Uint8Array<ArrayBuffer>[]).toString('utf8');
}

// ── API helpers ──────────────────────────────────────────────────────────────

const HEADERS = {
  accept: 'application/json, text/plain, */*',
  referer: 'https://downsub.com/',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

interface DownsubSubtitle {
  name: string;
  url: string;
  code?: string;
  completion?: number;
}

interface DownsubInfoResponse {
  state: number;
  title?: string;
  thumbnail?: string;
  duration?: string;
  source?: string;
  subtitles?: DownsubSubtitle[];
  subtitlesAutoTrans?: DownsubSubtitle[];
  dualSubtitles?: DownsubSubtitle[];
  urlSubtitle?: string;
  metadata?: unknown;
  playlist?: unknown[];
  playlistId?: string;
  announce?: string;
}

async function getVideoInfo(videoId: string): Promise<DownsubInfoResponse> {
  const encrypted = encryptAesCryptoJS(JSON.stringify(videoId), PASSPHRASE);
  const apiUrl = `https://get-info.downsub.com/${encrypted}`;

  const resp = await fetch(apiUrl, { headers: HEADERS });
  if (!resp.ok) {
    throw new Error(`get-info returned ${resp.status}: ${await resp.text()}`);
  }

  const body = await resp.text();
  try {
    const decrypted = decryptAesCryptoJS(body, PASSPHRASE);
    return JSON.parse(decrypted);
  } catch {
    return JSON.parse(body);
  }
}

type SubtitleFormat = 'txt' | 'srt' | 'raw';

async function fetchSubtitleContent(
  encryptedUrl: string,
  title: string,
  format: SubtitleFormat = 'txt'
): Promise<string> {
  const url = `https://subtitle.downsub.com/${format}/${encryptedUrl}/?title=${encodeURIComponent(title)}`;

  const resp = await fetch(url, { headers: HEADERS });
  if (!resp.ok) {
    throw new Error(`subtitle.downsub.com returned ${resp.status}: ${await resp.text()}`);
  }

  return resp.text();
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  program
    .option('--url <value>', 'YouTube video URL')
    .option('--id <value>', 'YouTube video ID')
    .option('--lang <value>', 'Language to download (default: first available)')
    .option('--format <value>', 'Subtitle format: txt, srt, or raw (default: txt)', 'txt')
    .parse(process.argv);

  const options = program.opts<{
    url?: string;
    id?: string;
    lang?: string;
    format: string;
  }>();

  if (options.url == null && options.id == null) {
    console.error('Error: either --url or --id is required.');
    process.exit(1);
  }
  if (options.url != null && options.id != null) {
    console.error('Error: --url and --id are mutually exclusive.');
    process.exit(1);
  }

  const format = options.format as SubtitleFormat;
  if (!['txt', 'srt', 'raw'].includes(format)) {
    console.error('Error: --format must be "txt", "srt", or "raw".');
    process.exit(1);
  }

  const videoId = options.id ?? extractVideoId(options.url!);
  if (videoId == null) {
    console.error(`Error: Could not extract a video ID from URL: ${options.url}`);
    process.exit(1);
  }

  console.info(`\nVideo ID : ${videoId}\n`);

  // Step 1: Get video info
  console.info('── Step 1: Fetching video info ──');
  const info = await getVideoInfo(videoId);

  console.info(`State    : ${info.state}`);
  console.info(`Title    : ${info.title}`);
  console.info(`Duration : ${info.duration}`);
  console.info(`Source   : ${info.source}`);

  if (info.subtitles && info.subtitles.length > 0) {
    console.info(`\nSubtitles (${info.subtitles.length}):`);
    for (const sub of info.subtitles) {
      console.info(`  - ${sub.name}${sub.completion != null ? ` (${sub.completion}%)` : ''}`);
    }
  } else {
    console.info('\nNo subtitles found.');
  }

  if (info.subtitlesAutoTrans && info.subtitlesAutoTrans.length > 0) {
    console.info(`\nAuto-translated subtitles (${info.subtitlesAutoTrans.length}):`);
    for (const sub of info.subtitlesAutoTrans.slice(0, 5)) {
      console.info(`  - ${sub.name}`);
    }
    if (info.subtitlesAutoTrans.length > 5) {
      console.info(`  ... and ${info.subtitlesAutoTrans.length - 5} more`);
    }
  }

  // Save the full info response
  const outputDir = path.resolve(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const infoPath = path.join(outputDir, `downsub-info-${videoId}.json`);
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), 'utf-8');
  console.info(`\nInfo saved to: ${infoPath}`);

  // Step 2: Download subtitle
  if (info.state !== 2 || !info.subtitles || info.subtitles.length === 0) {
    console.info('\nNo downloadable subtitles available.');
    return;
  }

  const allSubs = [...info.subtitles, ...(info.subtitlesAutoTrans ?? [])];
  let subtitle: DownsubSubtitle | undefined;
  if (options.lang != null) {
    subtitle = allSubs.find((s) => s.name.toLowerCase().includes(options.lang!.toLowerCase()));
    if (subtitle == null) {
      console.error(`\nError: No subtitle found matching "${options.lang}".`);
      console.info('Available languages:');
      for (const sub of allSubs) {
        console.info(`  - ${sub.name}`);
      }
      process.exit(1);
    }
  } else {
    subtitle = info.subtitles[0];
  }

  const title = `[${subtitle.name}] ${info.title ?? videoId}`;
  console.info(`\n── Step 2: Downloading subtitle (${subtitle.name}, format: ${format}) ──`);

  const content = await fetchSubtitleContent(subtitle.url, title, format);

  const safeName = subtitle.name.replace(/[^a-zA-Z0-9]/g, '_');
  const subtitlePath = path.join(outputDir, `downsub-${videoId}-${safeName}.${format}`);
  fs.writeFileSync(subtitlePath, content, 'utf-8');
  console.info(`Subtitle saved to: ${subtitlePath}`);

  // Show preview
  const lines = content.split('\n').slice(0, 20);
  console.info(`\nPreview (first ${lines.length} lines):`);
  for (const line of lines) {
    console.info(`  ${line}`);
  }
})();
