/**
 * Calls TranscriptAPI's /youtube/channel/latest endpoint for a single
 * channel and logs the raw JSON response. Use this to eyeball whether
 * the response carries any fields we don't already model — the handle,
 * in particular, is the reason this script exists.
 *
 * Usage:
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchTranscriptApiChannel.ts --channel @mkbhd
 *
 * The `--channel` argument accepts the same shapes the endpoint does:
 * an @handle, a full channel URL, or a bare UC-prefixed channel id.
 */
import { program } from 'commander';

import { isEmptyString } from '@/lib/string';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

const BASE_URL = 'https://transcriptapi.com/api/v2';

(async () => {
  program
    .requiredOption('--channel <value>', 'Channel handle, URL, or UC... id')
    .parse(process.argv);
  const { channel } = program.opts<{ channel: string }>();

  const apiKey = process.env.TRANSCRIPT_API_KEY;
  if (isEmptyString(apiKey)) {
    console.error('TRANSCRIPT_API_KEY is not set in the loaded .env file.');
    process.exit(1);
  }

  const url = `${BASE_URL}/youtube/channel/latest?channel=${encodeURIComponent(channel)}`;
  console.info('GET', url);

  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  console.info('Status:', res.status, res.statusText);

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.info('Body (non-JSON):');
    console.info(text);
    return;
  }

  console.info('Body:');
  console.info(JSON.stringify(parsed, null, 2));

  if (typeof parsed === 'object' && parsed != null && 'channel' in parsed) {
    const channelBlock = (parsed as { channel: Record<string, unknown> }).channel;
    console.info('\nChannel top-level keys:', Object.keys(channelBlock).sort().join(', '));
    if ('handle' in channelBlock) {
      console.info('✓ Response includes a `handle` field:', channelBlock.handle);
    } else {
      console.info('✗ Response does NOT include a `handle` field.');
    }
  }
})();
