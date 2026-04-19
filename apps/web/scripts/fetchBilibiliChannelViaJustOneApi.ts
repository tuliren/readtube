/**
 * Exercises the JustOneAPI path end-to-end for a given Bilibili mid.
 * Dumps the raw response envelope alongside the mapped
 * JustOneApiChannelResult that `fetchBilibiliChannelSnapshot`
 * consumes.
 *
 * The `uri` field on each item is very long and noisy — this script
 * strips it from the raw dump before printing.
 *
 * Requires JUSTONEAPI_TOKEN in the environment (see .env.example).
 *
 * Usage:
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchBilibiliChannelViaJustOneApi.ts --mid 946974
 *
 *   # Or use --raw to skip the mapped view entirely and just dump
 *   # the (uri-pruned) envelope JustOneAPI returned:
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchBilibiliChannelViaJustOneApi.ts --mid 946974 --raw
 */
import { program } from 'commander';

import { fetchBilibiliChannelViaJustOneApi } from '@/lib/platforms/bilibili/justOneApi';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

/** Deep-clone the raw response and drop `uri` from every video item
 *  so the log isn't dominated by Bilibili's multi-kB m3u8 / tracking
 *  URI blobs. */
function pruneRaw(raw: unknown): unknown {
  if (raw == null) {
    return raw;
  }
  const cloned = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  // response → data (outer) → data (inner) → item[]
  const inner = (cloned?.data as Record<string, unknown> | undefined)?.data as
    | Record<string, unknown>
    | undefined;
  const items = inner?.item;
  if (Array.isArray(items)) {
    for (const it of items) {
      if (typeof it === 'object' && it !== null) {
        delete (it as Record<string, unknown>).uri;
      }
    }
  }
  return cloned;
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

  const prunedRaw = pruneRaw(result.raw);

  if (raw) {
    console.info('--- RAW RESPONSE (uri stripped) ---');
    console.info(JSON.stringify(prunedRaw, null, 2));
    return;
  }

  console.info('--- RAW RESPONSE (uri stripped) ---');
  console.info(JSON.stringify(prunedRaw, null, 2));
  console.info('--- MAPPED CHANNEL ---');
  console.info(JSON.stringify(result.channel, null, 2));
  console.info('--- MAPPED VIDEOS ---');
  console.info(JSON.stringify(result.videos, null, 2));
  console.info(`Channel: ${result.channel.name ?? '(unknown)'} · ${result.videos.length} videos.`);
})();
