/**
 * Runs the full YouTube channel-snapshot pipeline — the same code path
 * the add-channel and refresh-channels workflows hit — and logs the
 * neutral ChannelSnapshot that upsertChannelWithVideos would persist.
 *
 * Exercises the three-source orchestration end-to-end: scrape (always),
 * RSS (primary video list), and TranscriptAPI (RSS-failure fallback),
 * including the parallel scrape+RSS path when the UC id is known
 * up-front and the sequential scrape-then-RSS path when only an
 * @handle is provided. For single-source eyeballing, use
 * `fetchYouTubeChannelByScraping.ts`, `fetchYouTubeRssChannel.ts`, or
 * `fetchTranscriptApiChannel.ts` instead.
 *
 * Usage:
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchYouTubeChannelSnapshot.ts \
 *     --url https://www.youtube.com/channel/UCY1kMZp36IQSyNx_9h4mpCg
 *
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchYouTubeChannelSnapshot.ts --url https://www.youtube.com/@mkbhd
 *
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchYouTubeChannelSnapshot.ts --channel UCY1kMZp36IQSyNx_9h4mpCg
 *
 * Exactly one of `--url` or `--channel` must be provided. `--channel`
 * mirrors the refresh path (UC id already known → parallel scrape+RSS).
 * `--url` accepts either a /channel/UCxxx URL (also parallel) or a
 * /@handle URL (sequential: scrape first to resolve UC, then RSS).
 */
import { program } from 'commander';

import { fetchChannelSnapshot } from '@/lib/platforms/youtube/channelSnapshot';
import { buildRssUrl, extractChannelId } from '@/lib/platforms/youtube/urls';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

(async () => {
  program
    .option('--url <value>', 'YouTube channel URL (/@handle or /channel/UCxxx)')
    .option('--channel <value>', 'Bare UC-prefixed channel id (e.g. UCY1kMZp36IQSyNx_9h4mpCg)')
    .parse(process.argv);

  const { url, channel } = program.opts<{ url?: string; channel?: string }>();

  if ((url == null) === (channel == null)) {
    console.error('Provide exactly one of --url or --channel.');
    process.exit(1);
  }

  let channelPageUrl: string;
  let rssUrl: string | undefined;

  if (channel != null) {
    channelPageUrl = `https://www.youtube.com/channel/${channel}`;
    rssUrl = buildRssUrl(channel);
  } else {
    channelPageUrl = url as string;
    const ucId = extractChannelId(channelPageUrl);
    rssUrl = ucId != null ? buildRssUrl(ucId) : undefined;
  }

  console.info('Fetching channel snapshot:', channelPageUrl);
  if (rssUrl != null) {
    console.info('RSS url known up-front (parallel scrape+RSS):', rssUrl);
  } else {
    console.info('RSS url unknown — scrape will resolve UC id first');
  }

  const start = Date.now();
  const snapshot = await fetchChannelSnapshot({ channelPageUrl, rssUrl });
  console.info(`Done in ${Date.now() - start}ms`);
  console.info(JSON.stringify(snapshot, null, 2));
  console.info(
    `channel=${snapshot.name} handle=${snapshot.handle ?? '(none)'} videos=${snapshot.videos.length}`
  );
})();
