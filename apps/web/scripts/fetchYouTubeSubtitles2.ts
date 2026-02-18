import { program } from 'commander';
import fs from 'fs';
import path from 'path';

import { extractVideoId, fetchSubtitleViaHtmlScraping } from '@/lib/subtitles';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
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
    return;
  }

  console.info(`Video ID : ${videoId}`);
  console.info('Approach : direct HTML scraping (timedtext endpoint)\n');

  let result;
  try {
    result = await fetchSubtitleViaHtmlScraping(videoId);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }

  console.info(`Title    : ${result.title}`);
  console.info(`Channel  : ${result.channel}`);
  console.info(`Language : ${result.languageName} (${result.language}) — ${result.captionType}`);
  console.info(`\nTranscript (${result.segmentCount} segments):\n`);

  for (const seg of result.segments) {
    console.info(`[${(seg.startMs / 1000).toFixed(2)}s] ${seg.text}`);
  }

  const output = { url, ...result };
  const outputDir = path.resolve(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `transcript-${videoId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  console.info(`\nTranscript written to: ${outputPath}`);
})();
