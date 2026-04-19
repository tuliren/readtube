/**
 * Runs the full Bilibili channel-snapshot pipeline (signed arc/search
 * + one view call for channel meta) and logs the neutral ChannelSnapshot
 * that upsertChannelWithVideos would persist. Use this to smoke-test
 * the add-channel / refresh-channels flow or to confirm the API path
 * works on a given mid.
 *
 * The earlier Puppeteer-based scrape (`channelScrape.ts` +
 * `lib/puppeteer/`) stays in the tree as dormant fallback infra in
 * case we need to route through a headless browser again.
 *
 * Usage:
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchBilibiliChannelSnapshot.ts --mid 946974
 */
import { program } from 'commander';

import { fetchBilibiliChannelSnapshot } from '@/lib/platforms/bilibili/channelSnapshot';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

(async () => {
  program
    .requiredOption('--mid <value>', 'Bilibili user mid (numeric, e.g. 946974)')
    .parse(process.argv);
  const { mid } = program.opts<{ mid: string }>();

  console.info('Fetching channel snapshot for mid:', mid);
  const start = Date.now();
  const snapshot = await fetchBilibiliChannelSnapshot(mid);
  console.info(`Done in ${Date.now() - start}ms`);
  console.info(JSON.stringify(snapshot, null, 2));
  console.info(`channel=${snapshot.name} videos=${snapshot.videos.length}`);
})();
