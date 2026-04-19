import { program } from 'commander';
import fs from 'fs';
import path from 'path';

import {
  extractVideoId,
  fetchSubtitleViaHtmlScraping,
  fetchSubtitleViaYoutubei,
} from '@/lib/platforms/youtube/subtitles';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

(async () => {
  program
    .option('--url <value>', 'YouTube video URL')
    .option('--id <value>', 'YouTube video ID')
    .option(
      '--method <value>',
      'Fetch method: "youtubei" (InnerTube API) or "scraping" (HTML scraping)',
      'youtubei'
    )
    .parse(process.argv);

  const options = program.opts<{
    url?: string;
    id?: string;
    method: string;
  }>();
  const url = options.url;
  const id = options.id;
  const method = options.method;

  if (method !== 'youtubei' && method !== 'scraping') {
    console.error('Error: --method must be "youtubei" or "scraping".');
    process.exit(1);
  }

  if (url == null && id == null) {
    console.error('Error: either --url or --id is required.');
    return;
  } else if (url != null && id != null) {
    console.error('Error: --url and --id are mutually exclusive. Please provide only one.');
    return;
  }

  const videoId = id ?? extractVideoId(url!);
  if (videoId == null) {
    console.error(`Error: Could not extract a video ID from URL: ${url}`);
    return;
  }

  console.info(`Video ID : ${videoId}`);

  let result;
  if (method === 'youtubei') {
    console.info('Approach : youtubei.js (InnerTube API)\n');
    try {
      result = await fetchSubtitleViaYoutubei(videoId);
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  } else {
    console.info('Approach : direct HTML scraping (timedtext endpoint)\n');
    try {
      result = await fetchSubtitleViaHtmlScraping(videoId);
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  }

  console.info(`Title    : ${result.title}`);
  console.info(`Channel  : ${result.channel}`);
  if (method === 'scraping') {
    console.info(`Language : ${result.languageName} (${result.language}) — ${result.captionType}`);
  }
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
