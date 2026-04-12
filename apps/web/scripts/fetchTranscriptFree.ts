/**
 * Fetch YouTube video transcripts for free using yt-dlp.
 *
 * This script demonstrates free transcript extraction without any paid API.
 * It uses yt-dlp (a local binary) to handle YouTube's anti-bot protections
 * and download subtitle tracks in JSON format.
 *
 * Usage:
 *   yarn script scripts/fetchTranscriptFree.ts --id <videoId>
 *   yarn script scripts/fetchTranscriptFree.ts --url <youtubeUrl>
 *   yarn script scripts/fetchTranscriptFree.ts --id <videoId> --lang ja
 *   yarn script scripts/fetchTranscriptFree.ts --id <videoId> --prefer auto
 *
 * Prerequisites:
 *   brew install yt-dlp
 */
import { execSync } from 'child_process';
import { program } from 'commander';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { extractVideoId } from '@/lib/subtitles';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

interface Json3Event {
  tStartMs: number;
  dDurationMs?: number;
  segs?: { utf8: string }[];
}

interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

interface FreeTranscriptResult {
  videoId: string;
  title: string;
  channel: string;
  language: string;
  captionType: 'manual' | 'auto-generated';
  segmentCount: number;
  segments: TranscriptSegment[];
}

function ensureYtDlp(): void {
  try {
    execSync('which yt-dlp', { stdio: 'pipe' });
  } catch {
    console.error('Error: yt-dlp is not installed. Install it with: brew install yt-dlp');
    process.exit(1);
  }
}

function parseJson3Events(filePath: string): TranscriptSegment[] {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const events: Json3Event[] = data.events ?? [];
  return events
    .filter((e) => e.segs && e.segs.length > 0)
    .map((e) => ({
      startMs: e.tStartMs,
      endMs: e.tStartMs + (e.dDurationMs ?? 0),
      text: e
        .segs!.map((s) => s.utf8)
        .join('')
        .trim(),
    }))
    .filter((s) => s.text.length > 0);
}

/**
 * Fetch a YouTube transcript for free using yt-dlp.
 *
 * Strategy:
 *   1. Run `yt-dlp --dump-json` to get video metadata (title, channel, available subs).
 *   2. Run `yt-dlp --write-sub` or `--write-auto-sub` to download subtitle file in json3 format.
 *   3. Parse the json3 file into TranscriptSegment[].
 *
 * This is the most reliable free approach because yt-dlp handles YouTube's
 * anti-bot protections (signature challenges, PoTokens, impersonation).
 */
async function fetchTranscriptViaYtDlp(
  videoId: string,
  lang: string,
  prefer: 'manual' | 'auto'
): Promise<FreeTranscriptResult> {
  ensureYtDlp();

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-transcript-'));

  try {
    // Step 1: Get video metadata
    console.info('Fetching video metadata...');
    const metaOutput = execSync(`yt-dlp --dump-json --skip-download "${url}" 2>/dev/null`, {
      timeout: 30000,
      maxBuffer: 50 * 1024 * 1024,
    });
    const meta = JSON.parse(metaOutput.toString());
    const title = meta.title ?? 'Unknown Title';
    const channel = meta.channel ?? meta.uploader ?? 'Unknown Channel';
    const manualLangs = Object.keys(meta.subtitles ?? {});
    const autoLangs = Object.keys(meta.automatic_captions ?? {});

    console.info(`Title   : ${title}`);
    console.info(`Channel : ${channel}`);
    console.info(`Manual  : ${manualLangs.length > 0 ? manualLangs.join(', ') : 'none'}`);
    console.info(
      `Auto    : ${autoLangs.length > 10 ? `${autoLangs.length} languages` : autoLangs.length > 0 ? autoLangs.join(', ') : 'none'}`
    );

    // Step 2: Determine which subtitle type to download
    const hasManual = manualLangs.includes(lang);
    const hasAuto = autoLangs.includes(lang);

    if (!hasManual && !hasAuto) {
      throw new Error(
        `No subtitles available for language "${lang}". ` +
          `Available manual: [${manualLangs.join(', ')}], auto: [${autoLangs.length} languages]`
      );
    }

    // Decide order based on preference
    const attempts =
      prefer === 'manual'
        ? [
            ...(hasManual
              ? [{ type: 'manual' as const, flag: '--write-sub --no-write-auto-sub' }]
              : []),
            ...(hasAuto
              ? [{ type: 'auto-generated' as const, flag: '--write-auto-sub --no-write-sub' }]
              : []),
          ]
        : [
            ...(hasAuto
              ? [{ type: 'auto-generated' as const, flag: '--write-auto-sub --no-write-sub' }]
              : []),
            ...(hasManual
              ? [{ type: 'manual' as const, flag: '--write-sub --no-write-auto-sub' }]
              : []),
          ];

    // Step 3: Download subtitles
    for (const attempt of attempts) {
      console.info(`\nDownloading ${attempt.type} subtitles (${lang})...`);
      const outputTemplate = path.join(tmpDir, '%(id)s');

      try {
        execSync(
          `yt-dlp ${attempt.flag} --sub-lang ${lang} --skip-download --sub-format json3 -o "${outputTemplate}" "${url}" 2>&1`,
          { timeout: 30000 }
        );

        const subFile = path.join(tmpDir, `${videoId}.${lang}.json3`);
        if (fs.existsSync(subFile) && fs.statSync(subFile).size > 0) {
          const segments = parseJson3Events(subFile);

          if (segments.length === 0) {
            console.info(`  Downloaded file was empty, trying next...`);
            continue;
          }

          return {
            videoId,
            title,
            channel,
            language: lang,
            captionType: attempt.type,
            segmentCount: segments.length,
            segments,
          };
        }
      } catch (e) {
        const msg = (e as Error).message.split('\n')[0];
        console.info(`  Failed: ${msg}`);
      }
    }

    throw new Error(
      `Could not download subtitles for "${lang}" despite being listed as available.`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

(async () => {
  program
    .option('--url <value>', 'YouTube video URL')
    .option('--id <value>', 'YouTube video ID')
    .option('--lang <value>', 'Subtitle language code', 'en')
    .option('--prefer <value>', 'Prefer "manual" or "auto" subtitles', 'manual')
    .parse(process.argv);

  const options = program.opts<{
    url?: string;
    id?: string;
    lang: string;
    prefer: string;
  }>();

  if (options.url == null && options.id == null) {
    console.error('Error: either --url or --id is required.');
    process.exit(1);
  }
  if (options.url != null && options.id != null) {
    console.error('Error: --url and --id are mutually exclusive.');
    process.exit(1);
  }
  if (options.prefer !== 'manual' && options.prefer !== 'auto') {
    console.error('Error: --prefer must be "manual" or "auto".');
    process.exit(1);
  }

  const videoId = options.id ?? extractVideoId(options.url!);
  if (videoId == null) {
    console.error(`Error: Could not extract video ID from URL: ${options.url}`);
    process.exit(1);
  }

  console.info(`Video ID: ${videoId}`);
  console.info(`Language: ${options.lang}`);
  console.info(`Prefer  : ${options.prefer}\n`);

  const result = await fetchTranscriptViaYtDlp(videoId, options.lang, options.prefer);

  console.info(`\nResult: ${result.captionType} subtitles, ${result.segmentCount} segments`);
  console.info(`\nTranscript (first 10 segments):\n`);

  for (const seg of result.segments.slice(0, 10)) {
    console.info(`[${(seg.startMs / 1000).toFixed(2)}s] ${seg.text}`);
  }

  if (result.segments.length > 10) {
    console.info(`... and ${result.segments.length - 10} more segments`);
  }

  // Save full result
  const outputDir = path.resolve(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `transcript-free-${videoId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  console.info(`\nFull transcript written to: ${outputPath}`);
})();
