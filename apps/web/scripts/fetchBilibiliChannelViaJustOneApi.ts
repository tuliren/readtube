/**
 * Exercises the JustOneAPI path end-to-end for a given Bilibili mid.
 * Dumps the raw response envelope (so the exact field names are
 * visible on first run) alongside the mapped JustOneApiChannelResult
 * that `fetchBilibiliChannelSnapshot` consumes.
 *
 * Requires JUSTONEAPI_TOKEN in the environment (see .env.example).
 *
 * Usage:
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchBilibiliChannelViaJustOneApi.ts --mid 946974
 *
 *   # Or use --raw to skip the mapped view entirely and just dump
 *   # the envelope JustOneAPI returned:
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchBilibiliChannelViaJustOneApi.ts --mid 946974 --raw
 */
import { program } from 'commander';

import { fetchBilibiliChannelViaJustOneApi } from '@/lib/platforms/bilibili/justOneApi';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

(async () => {
  program
    .requiredOption('--mid <value>', 'Bilibili user mid (numeric, e.g. 946974)')
    .option('--raw', 'Print only the raw response envelope', false)
    .parse(process.argv);
  const { mid, raw } = program.opts<{ mid: string; raw: boolean }>();

  if (process.env.JUSTONEAPI_TOKEN == null || process.env.JUSTONEAPI_TOKEN.length === 0) {
    console.error('JUSTONEAPI_TOKEN is not set. Add it to apps/web/.env.development.');
    process.exit(1);
  }

  console.info(`Calling JustOneAPI for mid=${mid}`);
  const start = Date.now();
  const result = await fetchBilibiliChannelViaJustOneApi(mid);
  console.info(`Done in ${Date.now() - start}ms`);

  if (raw) {
    console.info('--- RAW RESPONSE ---');
    console.info(JSON.stringify(result.raw, null, 2));
    return;
  }

  console.info('--- RAW RESPONSE ---');
  console.info(JSON.stringify(result.raw, null, 2));
  console.info('--- MAPPED CHANNEL ---');
  console.info(JSON.stringify(result.channel, null, 2));
  console.info('--- MAPPED VIDEOS ---');
  console.info(JSON.stringify(result.videos, null, 2));
  console.info(`Channel: ${result.channel.name ?? '(unknown)'} · ${result.videos.length} videos.`);
})();
