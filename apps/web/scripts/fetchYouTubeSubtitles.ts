import { program } from 'commander';
import fs from 'fs';
import path from 'path';
import { Innertube } from 'youtubei.js';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Standard: https://www.youtube.com/watch?v=VIDEO_ID
    if (parsed.hostname.includes('youtube.com') && parsed.pathname === '/watch') {
      return parsed.searchParams.get('v');
    }

    // Short: https://youtu.be/VIDEO_ID
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('?')[0] || null;
    }

    // Shorts: https://www.youtube.com/shorts/VIDEO_ID
    const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?]+)/);
    if (shortsMatch) {
      return shortsMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

(async () => {
  program.option('--url <value>', 'YouTube video URL').parse(process.argv);

  const options = program.opts();
  const url: string = options.url;

  if (!url) {
    console.error(
      'Error: --url is required. Example: --url "https://www.youtube.com/watch?v=dQw4w9WgXcQ"'
    );
    process.exit(1);
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    console.error(`Error: Could not extract a video ID from URL: ${url}`);
    process.exit(1);
  }

  console.info(`Video ID: ${videoId}`);

  const yt = await Innertube.create({ retrieve_player: false });

  const info = await yt.getInfo(videoId);
  const title = info.basic_info.title ?? 'Unknown Title';
  const channel = info.basic_info.author ?? 'Unknown Channel';

  console.info(`Title   : ${title}`);
  console.info(`Channel : ${channel}`);

  // Fetch transcript (returns native language by default)
  let transcriptData;
  try {
    transcriptData = await info.getTranscript();
  } catch (err) {
    console.error('Error: Could not fetch transcript. The video may not have subtitles available.');
    console.error((err as Error).message);
    process.exit(1);
  }

  const rawSegments = transcriptData?.transcript?.content?.body?.initial_segments ?? [];

  if (rawSegments.length === 0) {
    console.error('No transcript segments found for this video.');
    process.exit(1);
  }

  const segments: TranscriptSegment[] = rawSegments
    .filter((seg: any) => seg.type === 'TranscriptSegment')
    .map((seg: any) => ({
      startMs: Number(seg.start_ms),
      endMs: Number(seg.end_ms),
      text: seg.snippet?.text ?? '',
    }));

  // --- Console output ---
  console.info(`\nTranscript (${segments.length} segments):\n`);
  for (const seg of segments) {
    const startSec = (seg.startMs / 1000).toFixed(2);
    console.info(`[${startSec}s] ${seg.text}`);
  }

  // --- File output ---
  const output = {
    videoId,
    url,
    title,
    channel,
    segmentCount: segments.length,
    segments,
  };

  const outputDir = path.resolve(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `transcript-${videoId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  console.info(`\nTranscript written to: ${outputPath}`);
})();
