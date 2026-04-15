/**
 * Runs scrapeChannel() against a live YouTube channel page and logs the
 * parsed result. Useful for eyeballing what the scraper extracts —
 * channel id, name, logo URL, handle, and the first N videos — before
 * wiring new fields through to the DB.
 *
 * Usage:
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/scrapeYouTubeChannel.ts --url https://www.youtube.com/@mkbhd
 *
 * `--url` accepts either a /@handle or /channel/UCxxx YouTube URL
 * (with or without a trailing /videos segment).
 */
import { program } from 'commander';

import { scrapeChannel } from '@/lib/youtube/scrapeChannel';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

(async () => {
  program
    .requiredOption('--url <value>', 'YouTube channel URL (/@handle or /channel/UCxxx)')
    .parse(process.argv);
  const { url } = program.opts<{ url: string }>();

  console.info('Scraping:', url);

  const result = await scrapeChannel(url);
  console.info(JSON.stringify(result, null, 2));
})();
