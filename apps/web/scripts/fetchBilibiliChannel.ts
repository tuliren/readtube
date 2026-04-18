/**
 * Scrapes a Bilibili user's /upload/video page via Puppeteer and logs
 * the parsed result — mid, channel name, logo URL, and the list of
 * BV ids in publication-date-descending order.
 *
 * Usage:
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchBilibiliChannel.ts --mid 946974
 */
import { program } from 'commander';

import { scrapeBilibiliChannel } from '@/lib/platforms/bilibili/channelScrape';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

(async () => {
  program
    .requiredOption('--mid <value>', 'Bilibili user mid (numeric, e.g. 946974)')
    .parse(process.argv);
  const { mid } = program.opts<{ mid: string }>();

  console.info('Scraping mid:', mid);
  const result = await scrapeBilibiliChannel(mid);
  console.info(JSON.stringify(result, null, 2));
  console.info(`Found ${result.videos.length} videos.`);
})();
