/**
 * Calls fetchRssFeed() against YouTube's native channel RSS feed
 * (`https://www.youtube.com/feeds/videos.xml?channel_id=UCxxx`) and
 * logs the parsed result. Useful for eyeballing what the RSS feed
 * returns — title, publish time, canonical link (which distinguishes
 * /watch from /shorts), thumbnail URL, and description.
 *
 * Usage:
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchYouTubeRssChannel.ts --channel UCY1kMZp36IQSyNx_9h4mpCg
 *
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchYouTubeRssChannel.ts \
 *     --url https://www.youtube.com/feeds/videos.xml?channel_id=UCY1kMZp36IQSyNx_9h4mpCg
 *
 * Exactly one of `--channel` or `--url` must be provided.
 */
import { program } from 'commander';

import { fetchRssFeed } from '@/lib/platforms/youtube/channelRss';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

(async () => {
  program
    .option('--channel <value>', 'Bare UC-prefixed channel id (e.g. UCY1kMZp36IQSyNx_9h4mpCg)')
    .option('--url <value>', 'Full RSS feed URL')
    .parse(process.argv);

  const { channel, url } = program.opts<{ channel?: string; url?: string }>();

  if ((channel == null) === (url == null)) {
    console.error('Provide exactly one of --channel or --url.');
    process.exit(1);
  }

  const rssUrl = url ?? `https://www.youtube.com/feeds/videos.xml?channel_id=${channel}`;
  console.info('GET', rssUrl);

  const result = await fetchRssFeed(rssUrl);
  console.info(JSON.stringify(result, null, 2));
})();
