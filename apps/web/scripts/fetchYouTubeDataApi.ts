/**
 * Exercises the YouTube Data API client (`dataApi.ts`) directly —
 * the primary metadata source when `YOUTUBE_API_KEY` is set. Use it
 * to verify a freshly-created GCP API key and to eyeball the
 * ChannelSnapshot / VideoSnapshot the Data API path produces before
 * the orchestrators (channelSnapshot.ts / videoSnapshot.ts) rely on
 * it. For the full orchestration including fallbacks, use
 * `fetchYouTubeChannelSnapshot.ts` / `fetchYouTubeVideoInfo.ts`.
 *
 * Usage:
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchYouTubeDataApi.ts --channel UCY1kMZp36IQSyNx_9h4mpCg
 *
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchYouTubeDataApi.ts --handle @mkbhd
 *
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchYouTubeDataApi.ts --video dQw4w9WgXcQ
 *
 * Exactly one of `--channel`, `--handle`, or `--video` must be given.
 */
import { program } from 'commander';

import {
  fetchChannelViaDataApi,
  fetchVideoViaDataApi,
  isDataApiConfigured,
} from '@/lib/platforms/youtube/dataApi';

// Read-only against the external YouTube API (no database access),
// so unlike the snapshot scripts it is safe to run with the
// production env too — useful for verifying the production API key.
if (process.env.SCRIPT_ENV !== 'development' && process.env.SCRIPT_ENV !== 'production') {
  console.error('This script must be run via runScriptWithEnv.sh (development or production).');
  process.exit(1);
}

(async () => {
  program
    .option('--channel <value>', 'Bare UC-prefixed channel id (e.g. UCY1kMZp36IQSyNx_9h4mpCg)')
    .option('--handle <value>', 'Channel handle (e.g. @mkbhd)')
    .option('--video <value>', 'Bare 11-char video id (e.g. dQw4w9WgXcQ)')
    .parse(process.argv);

  const { channel, handle, video } = program.opts<{
    channel?: string;
    handle?: string;
    video?: string;
  }>();

  const provided = [channel, handle, video].filter((v) => v != null);
  if (provided.length !== 1) {
    console.error('Provide exactly one of --channel, --handle, or --video.');
    process.exit(1);
  }

  if (!isDataApiConfigured()) {
    console.error('YOUTUBE_API_KEY is not set — add it to apps/web/.env.development first.');
    process.exit(1);
  }

  const start = Date.now();
  if (video != null) {
    const snapshot = await fetchVideoViaDataApi(video);
    console.info(`Done in ${Date.now() - start}ms`);
    console.info(JSON.stringify(snapshot, null, 2));
  } else {
    const snapshot = await fetchChannelViaDataApi(
      channel != null ? { channelId: channel } : { handle: handle as string }
    );
    console.info(`Done in ${Date.now() - start}ms`);
    console.info(JSON.stringify(snapshot, null, 2));
    console.info(
      `channel=${snapshot.name} handle=${snapshot.handle ?? '(none)'} videos=${snapshot.videos.length}`
    );
  }
})();
