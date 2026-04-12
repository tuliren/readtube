/**
 * CLI script to test the downsub.com subtitle fetcher.
 *
 * Usage:
 *   npm run script -- development fetchViaDownsub.ts --id XIhc7_Ptrpk
 *   npm run script -- development fetchViaDownsub.ts --url "https://www.youtube.com/watch?v=XIhc7_Ptrpk"
 *   npm run script -- development fetchViaDownsub.ts --id XIhc7_Ptrpk --lang japanese
 */
import { program } from 'commander';
import fs from 'fs';
import path from 'path';

import { extractVideoId, fetchSubtitleViaDownsub } from '@/lib/subtitles';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

(async () => {
  program
    .option('--url <value>', 'YouTube video URL')
    .option('--id <value>', 'YouTube video ID')
    .option('--lang <value>', 'Language to download (default: first available)')
    .parse(process.argv);

  const options = program.opts<{
    url?: string;
    id?: string;
    lang?: string;
  }>();

  if (options.url == null && options.id == null) {
    console.error('Error: either --url or --id is required.');
    process.exit(1);
  }
  if (options.url != null && options.id != null) {
    console.error('Error: --url and --id are mutually exclusive.');
    process.exit(1);
  }

  const videoId = options.id ?? extractVideoId(options.url!);
  if (videoId == null) {
    console.error(`Error: Could not extract a video ID from URL: ${options.url}`);
    process.exit(1);
  }

  console.info(`\nVideo ID : ${videoId}\n`);

  const result = await fetchSubtitleViaDownsub(videoId, options.lang);

  console.info(`Language : ${result.language}`);
  console.info(`Segments : ${result.segments.length}\n`);

  // Show preview
  for (const seg of result.segments.slice(0, 20)) {
    console.info(`  [${(seg.startMs / 1000).toFixed(2)}s] ${seg.text}`);
  }

  // Save output
  const outputDir = path.resolve(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `downsub-${videoId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  console.info(`\nSaved to: ${outputPath}`);
})();
