/**
 * Probe script for JustOneAPI's Bilibili captions endpoint.
 * Takes a BV id, looks up the aid + cid from api.bilibili.com's
 * `x/web-interface/view` (which we already hit in
 * fetchBilibiliVideoSnapshot), then calls JustOneAPI's
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

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

const JUSTONEAPI_BASE_URL = 'https://api.justoneapi.com';
const CAPTIONS_PATH = '/api/bilibili/get-video-caption/v2';
const BILIBILI_VIEW_URL = 'https://api.bilibili.com/x/web-interface/view';
const BILIBILI_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

interface ViewPage {
  cid?: unknown;
  page?: unknown;
  part?: unknown;
  duration?: unknown;
}

interface ViewResponse {
  code: number;
  message: string;
  data?: {
    bvid?: string;
    aid?: number;
    cid?: number;
    title?: string;
    pages?: ViewPage[];
  };
}

async function fetchAidCid(
  bvid: string,
  pageIndex: number
): Promise<{ aid: string; cid: string; title: string; totalPages: number }> {
  const url = `${BILIBILI_VIEW_URL}?bvid=${encodeURIComponent(bvid)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': BILIBILI_USER_AGENT,
      Referer: 'https://www.bilibili.com/',
    },
  });
  if (!res.ok) {
    throw new Error(`Bilibili view returned HTTP ${res.status}`);
  }
  const json = (await res.json()) as ViewResponse;
  if (json.code !== 0 || json.data == null) {
    throw new Error(`Bilibili view error: code=${json.code} message=${json.message}`);
  }

  const { aid, pages = [], title = '' } = json.data;
  if (typeof aid !== 'number') {
    throw new Error('Bilibili view response is missing aid');
  }
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error('Bilibili view response has no pages[]');
  }
  if (pageIndex < 1 || pageIndex > pages.length) {
    throw new Error(
      `--page ${pageIndex} out of range. Video has ${pages.length} part(s); pass 1..${pages.length}.`
    );
  }
  const selected = pages[pageIndex - 1];
  const cid = typeof selected?.cid === 'number' ? selected.cid : null;
  if (cid == null) {
    throw new Error(`Page ${pageIndex} has no cid`);
  }

  return { aid: String(aid), cid: String(cid), title, totalPages: pages.length };
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
