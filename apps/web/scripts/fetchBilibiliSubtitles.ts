import { program } from 'commander';
import fs from 'fs';
import path from 'path';

import { extractBilibiliVideoId, fetchSubtitleViaBilibili } from '@/lib/subtitles';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

(async () => {
  program
    .option('--url <value>', 'Bilibili video URL (e.g., https://www.bilibili.com/video/BV...)')
    .option('--bvid <value>', 'Bilibili BV ID (e.g., BV17x411w7KC)')
    .option('--page <value>', 'Page number for multi-part videos', '1')
    .option('--lang <value>', 'Preferred language code (e.g., zh-CN, en)')
    .parse(process.argv);

  const options = program.opts<{
    url?: string;
    bvid?: string;
    page: string;
    lang?: string;
  }>();

  const sessdata = process.env.BILIBILI_SESSDATA;
  if (sessdata == null) {
    console.error(
      'Error: BILIBILI_SESSDATA environment variable is required.\n' +
        'Get it by logging into bilibili.com and copying the SESSDATA cookie value.'
    );
    process.exit(1);
  }

  if (options.url == null && options.bvid == null) {
    console.error('Error: either --url or --bvid is required.');
    process.exit(1);
  }
  if (options.url != null && options.bvid != null) {
    console.error('Error: --url and --bvid are mutually exclusive.');
    process.exit(1);
  }

  const input = options.bvid ?? options.url!;
  const bvid = extractBilibiliVideoId(input);
  if (bvid == null) {
    console.error(`Error: Could not extract a BV ID from: ${input}`);
    process.exit(1);
  }

  const page = parseInt(options.page, 10);
  console.info(`BV ID    : ${bvid}`);
  console.info(`Page     : ${page}`);

  try {
    const result = await fetchSubtitleViaBilibili(bvid, {
      sessdata,
      page,
      preferredLanguage: options.lang,
    });

    console.info(`Title    : ${result.title}`);
    console.info(`Channel  : ${result.channel}`);
    console.info(`Language : ${result.languageName} (${result.language}) — ${result.captionType}`);
    console.info(`\nTranscript (${result.segmentCount} segments):\n`);

    for (const seg of result.segments) {
      console.info(`[${(seg.startMs / 1000).toFixed(2)}s] ${seg.text}`);
    }

    const output = { bvid, page, ...result };
    const outputDir = path.resolve(__dirname, 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `transcript-bilibili-${bvid}-p${page}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

    console.info(`\nTranscript written to: ${outputPath}`);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
})();
