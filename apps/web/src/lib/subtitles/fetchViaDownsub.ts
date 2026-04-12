import crypto from 'crypto';

import { SubtitleFetchError, type TranscriptSegment } from './types';

// ── CryptoJS-compatible AES helpers ──────────────────────────────────────────
// Downsub uses CryptoJS passphrase mode: OpenSSL EVP_BytesToKey (MD5) to
// derive key + IV from a random 8-byte salt, then AES-256-CBC encrypts.
// The output format is {ct, iv, s} as JSON, then base64-encoded.

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

function encryptForDownsub(plaintext: string): string {
  const salt = new Uint8Array(crypto.randomBytes(8)) as Uint8Array<ArrayBuffer>;
  const pw = new Uint8Array(Buffer.from(PASSPHRASE, 'utf8')) as Uint8Array<ArrayBuffer>;
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

function decryptFromDownsub(b64: string): string {
  const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  const ct = new Uint8Array(Buffer.from(json.ct, 'base64')) as Uint8Array<ArrayBuffer>;
  const salt = new Uint8Array(Buffer.from(json.s, 'hex')) as Uint8Array<ArrayBuffer>;
  const pw = new Uint8Array(Buffer.from(PASSPHRASE, 'utf8')) as Uint8Array<ArrayBuffer>;
  const { key, iv } = evpBytesToKey(pw, salt, 32, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decA = decipher.update(ct);
  const decB = decipher.final();
  return Buffer.concat([
    new Uint8Array(decA),
    new Uint8Array(decB),
  ] as Uint8Array<ArrayBuffer>[]).toString('utf8');
}

// ── Downsub API types ────────────────────────────────────────────────────────

interface DownsubSubtitle {
  name: string;
  url: string;
  code?: string;
}

interface DownsubInfoResponse {
  state: number;
  title?: string;
  subtitles?: DownsubSubtitle[];
  subtitlesAutoTrans?: DownsubSubtitle[];
}

// ── API calls ────────────────────────────────────────────────────────────────

const HEADERS = {
  accept: 'application/json, text/plain, */*',
  referer: 'https://downsub.com/',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

async function getDownsubInfo(videoId: string): Promise<DownsubInfoResponse> {
  const encrypted = encryptForDownsub(JSON.stringify(videoId));
  const url = `https://get-info.downsub.com/${encrypted}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown network error';
    throw new SubtitleFetchError(`Downsub network error: ${message}`, { transient: true });
  }

  if (!res.ok) {
    const body = await res.text();
    throw new SubtitleFetchError(`Downsub get-info error ${res.status}: ${body}`, {
      transient: res.status >= 500 || res.status === 429,
      status: res.status,
    });
  }

  const rawBody = await res.text();
  try {
    const decrypted = decryptFromDownsub(rawBody);
    return JSON.parse(decrypted);
  } catch {
    return JSON.parse(rawBody);
  }
}

async function fetchDownsubSrt(encryptedSubtitleUrl: string, title: string): Promise<string> {
  const url = `https://subtitle.downsub.com/srt/${encryptedSubtitleUrl}/?title=${encodeURIComponent(title)}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown network error';
    throw new SubtitleFetchError(`Downsub subtitle download error: ${message}`, {
      transient: true,
    });
  }

  if (!res.ok) {
    const body = await res.text();
    throw new SubtitleFetchError(`Downsub subtitle error ${res.status}: ${body}`, {
      transient: res.status >= 500 || res.status === 429,
      status: res.status,
    });
  }

  return res.text();
}

// ── SRT parser ───────────────────────────────────────────────────────────────

function parseSrtTimestamp(ts: string): number {
  // "HH:MM:SS,mmm" → milliseconds
  const match = ts.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (match == null) {
    return 0;
  }
  const [, h, m, s, ms] = match;
  return Number(h) * 3600000 + Number(m) * 60000 + Number(s) * 1000 + Number(ms);
}

/** Exported for testing. */
export function parseSrtToSegments(srt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  // Split into blocks separated by blank lines
  const blocks = srt.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) {
      continue;
    }

    // Find the timestamp line (contains " --> ")
    const tsLineIndex = lines.findIndex((l) => l.includes(' --> '));
    if (tsLineIndex === -1) {
      continue;
    }

    const [startStr, endStr] = lines[tsLineIndex].split(' --> ');
    const text = lines
      .slice(tsLineIndex + 1)
      .join(' ')
      .trim();

    if (text.length === 0) {
      continue;
    }

    segments.push({
      startMs: parseSrtTimestamp(startStr),
      endMs: parseSrtTimestamp(endStr),
      text,
    });
  }

  return segments;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch subtitles for a YouTube video via downsub.com (no API key needed).
 *
 * Downsub proxies YouTube's timedtext endpoint, so it can return subtitles
 * for any video that has captions (manual or auto-generated). It cannot
 * generate auto-translated subtitles on the fly.
 *
 * @param videoId  YouTube video ID (e.g. "XIhc7_Ptrpk")
 * @param lang     Optional language filter (case-insensitive substring match
 *                 against the subtitle name, e.g. "english", "japanese").
 *                 Defaults to the first available subtitle track.
 */
export async function fetchSubtitleViaDownsub(
  videoId: string,
  lang?: string
): Promise<{ segments: TranscriptSegment[]; language: string }> {
  const info = await getDownsubInfo(videoId);

  if (info.state !== 2 || !info.subtitles || info.subtitles.length === 0) {
    throw new SubtitleFetchError('Downsub: no subtitles found for this video', {
      transient: false,
    });
  }

  let subtitle: DownsubSubtitle | undefined;
  if (lang != null) {
    subtitle = info.subtitles.find((s) => s.name.toLowerCase().includes(lang.toLowerCase()));
  }
  if (subtitle == null) {
    subtitle = info.subtitles[0];
  }

  const title = `[${subtitle.name}] ${info.title ?? videoId}`;
  const srt = await fetchDownsubSrt(subtitle.url, title);
  const segments = parseSrtToSegments(srt);

  if (segments.length === 0) {
    throw new SubtitleFetchError('Downsub: transcript is empty after parsing SRT', {
      transient: false,
    });
  }

  return {
    segments,
    language: subtitle.code ?? subtitle.name,
  };
}
