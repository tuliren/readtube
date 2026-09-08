/**
 * Probe script for JustOneAPI's Bilibili captions endpoint.
 * Takes a BV id, looks up the aid + cid through `fetchBilibiliVideoView`
 * (Bilibili's view endpoint, JustOneAPI's video-detail fallback when
 * that is blocked), then calls JustOneAPI's
 * `/api/bilibili/get-video-caption/v2` and dumps the raw response.
 *
 * Docs: https://docs.justoneapi.com/zh/api/bilibili/video-captions-v2
 *
 * The response schema isn't published (client-rendered on the docs
 * page) — this script exists so we can see the real shape before
 * wiring it into BilibiliPlatform.fetchTranscript.
 *
 * Requires JUSTONEAPI_TOKEN in the environment (see .env.example).
 *
 * Usage:
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchBilibiliTranscriptViaJustOneApi.ts --bvid BV1H7S9B5ENL
 *
 *   # Or pass aid/cid explicitly to skip the view lookup:
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchBilibiliTranscriptViaJustOneApi.ts \
 *     --bvid BV1H7S9B5ENL --aid 116354506032318 --cid 37266195035
 *
 *   # --page picks a specific part of a multi-part video (1-indexed).
 *   # Defaults to 1 (first part).
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchBilibiliTranscriptViaJustOneApi.ts \
 *     --bvid BV1XXX --page 2
 */
import { program } from 'commander';

import { fetchBilibiliVideoView } from '@/lib/platforms/bilibili/videoView';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

const JUSTONEAPI_BASE_URL = 'https://api.justoneapi.com';
const CAPTIONS_PATH = '/api/bilibili/get-video-caption/v2';

async function fetchAidCid(
  bvid: string,
  pageIndex: number
): Promise<{ aid: string; cid: string; title: string; totalPages: number }> {
  const view = await fetchBilibiliVideoView(bvid);
  if (view.aid == null) {
    throw new Error('Bilibili view data is missing aid');
  }
  if (view.pages.length === 0) {
    throw new Error('Bilibili view data has no pages[]');
  }
  if (pageIndex < 1 || pageIndex > view.pages.length) {
    throw new Error(
      `--page ${pageIndex} out of range. Video has ${view.pages.length} part(s); pass 1..${view.pages.length}.`
    );
  }
  const cid = view.pages[pageIndex - 1]?.cid;
  if (cid == null) {
    throw new Error(`Page ${pageIndex} has no cid`);
  }

  return {
    aid: String(view.aid),
    cid: String(cid),
    title: view.title,
    totalPages: view.pages.length,
  };
}

(async () => {
  program
    .requiredOption('--bvid <value>', 'Bilibili BV id (e.g. BV1H7S9B5ENL)')
    .option('--aid <value>', 'Bilibili AID — looked up from view endpoint if omitted')
    .option('--cid <value>', 'Bilibili CID — looked up from view endpoint if omitted')
    .option('--page <n>', '1-indexed part number for multi-part videos (default: 1)', '1')
    .parse(process.argv);
  const opts = program.opts<{
    bvid: string;
    aid?: string;
    cid?: string;
    page: string;
  }>();

  if (process.env.JUSTONEAPI_TOKEN == null || process.env.JUSTONEAPI_TOKEN.length === 0) {
    console.error('JUSTONEAPI_TOKEN is not set. Add it to apps/web/.env.development.');
    process.exit(1);
  }

  const pageIndex = Number.parseInt(opts.page, 10);
  if (!Number.isFinite(pageIndex) || pageIndex < 1) {
    console.error(`--page must be a positive integer, got ${opts.page}`);
    process.exit(1);
  }

  let aid: string;
  let cid: string;
  if (opts.aid != null && opts.cid != null) {
    aid = opts.aid;
    cid = opts.cid;
    console.info(`Using provided aid=${aid} cid=${cid}`);
  } else {
    console.info(`Looking up aid/cid from view for ${opts.bvid} (part ${pageIndex})`);
    const lookup = await fetchAidCid(opts.bvid, pageIndex);
    aid = lookup.aid;
    cid = lookup.cid;
    console.info(`title="${lookup.title}" totalParts=${lookup.totalPages} aid=${aid} cid=${cid}`);
  }

  const url =
    `${JUSTONEAPI_BASE_URL}${CAPTIONS_PATH}` +
    `?token=${encodeURIComponent(process.env.JUSTONEAPI_TOKEN)}` +
    `&bvid=${encodeURIComponent(opts.bvid)}` +
    `&aid=${encodeURIComponent(aid)}` +
    `&cid=${encodeURIComponent(cid)}`;
  const redactedUrl = url.replace(/token=[^&]+/, 'token=<redacted>');
  console.info(`GET ${redactedUrl}`);

  const start = Date.now();
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  console.info(`HTTP ${res.status} in ${Date.now() - start}ms`);

  const bodyText = await res.text();
  let body: unknown = bodyText;
  try {
    body = JSON.parse(bodyText);
  } catch {
    // leave as raw text
  }

  console.info('--- RAW RESPONSE ---');
  console.info(JSON.stringify(body, null, 2));
})();
