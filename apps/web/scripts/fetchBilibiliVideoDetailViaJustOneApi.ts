/**
 * Probe script for JustOneAPI's Bilibili video-detail endpoint — the
 * paid fallback `fetchBilibiliVideoView` uses when Bilibili's own
 * `x/web-interface/view` refuses the request (HTTP 412 from risk
 * control, rate limits, server errors).
 *
 * Docs: https://docs.justoneapi.com/zh/api/bilibili/video-details-v2
 *
 * The response schema isn't published (client-rendered on the docs
 * page); this script dumps the real envelope so the mapper can be
 * checked against it. `--compare-direct` also calls Bilibili's view
 * endpoint directly so the two shapes can be diffed side by side.
 *
 * Requires JUSTONEAPI_TOKEN in the environment (see .env.example).
 *
 * Usage:
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchBilibiliVideoDetailViaJustOneApi.ts --bvid BV1XXXXXXXXX
 *
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchBilibiliVideoDetailViaJustOneApi.ts --bvid BV1XXXXXXXXX --compare-direct
 */
import { program } from 'commander';
import { writeFileSync } from 'node:fs';

import { BILIBILI_USER_AGENT } from '@/lib/platforms/bilibili/videoView';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

const JUSTONEAPI_BASE_URL = 'https://api.justoneapi.com';
const VIDEO_DETAIL_PATH = '/api/bilibili/get-video-detail/v2';
const BILIBILI_VIEW_URL = 'https://api.bilibili.com/x/web-interface/view';

/** Truncate long strings so URL blobs don't dominate the dump. */
function abbreviate(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > 100 ? `${value.slice(0, 100)}…(${value.length} chars)` : value;
  }
  if (Array.isArray(value)) {
    return value.map(abbreviate);
  }
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, abbreviate(v)])
    );
  }
  return value;
}

async function dump(label: string, url: string, headers: Record<string, string>): Promise<unknown> {
  console.info(`--- ${label}: GET ${url.replace(/token=[^&]+/, 'token=<redacted>')}`);
  const start = Date.now();
  const res = await fetch(url, { headers });
  console.info(`HTTP ${res.status} in ${Date.now() - start}ms`);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // leave as raw text
  }
  console.info(JSON.stringify(abbreviate(body), null, 2));
  return body;
}

(async () => {
  program
    .requiredOption('--bvid <value>', 'Bilibili BV id')
    .option('--compare-direct', "Also call Bilibili's own view endpoint", false)
    .option('--out <file>', 'Also write the full, un-abbreviated bodies to this JSON file')
    .parse(process.argv);
  const { bvid, compareDirect, out } = program.opts<{
    bvid: string;
    compareDirect: boolean;
    out?: string;
  }>();

  if (process.env.JUSTONEAPI_TOKEN == null || process.env.JUSTONEAPI_TOKEN.length === 0) {
    console.error('JUSTONEAPI_TOKEN is not set. Add it to apps/web/.env.development.');
    process.exit(1);
  }

  const justOneApi = await dump(
    'JustOneAPI video detail',
    `${JUSTONEAPI_BASE_URL}${VIDEO_DETAIL_PATH}?token=${encodeURIComponent(process.env.JUSTONEAPI_TOKEN)}&bvid=${encodeURIComponent(bvid)}`,
    { Accept: 'application/json' }
  );

  let direct: unknown = null;
  if (compareDirect) {
    direct = await dump(
      'Bilibili view (direct)',
      `${BILIBILI_VIEW_URL}?bvid=${encodeURIComponent(bvid)}`,
      {
        Accept: 'application/json',
        'User-Agent': BILIBILI_USER_AGENT,
        Referer: 'https://www.bilibili.com/',
      }
    );
  }

  if (out != null) {
    writeFileSync(out, JSON.stringify({ justOneApi, direct }, null, 2));
    console.info(`Wrote full bodies to ${out}`);
  }
})();
