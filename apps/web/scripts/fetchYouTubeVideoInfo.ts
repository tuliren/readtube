/**
 * Probes a YouTube video to surface the signals we use to tell a
 * scheduled premiere / upcoming livestream apart from a normal
 * already-aired video. Used to design + verify the scheduled-video
 * detection in `lib/platforms/youtube/scheduledVideo.ts`.
 *
 * Reports, in order:
 *   1. Watch-page scrape — the unambiguous `isUpcoming` flag plus
 *      `liveBroadcastDetails.startTimestamp` and `scheduledStartTime`.
 *   2. TranscriptAPI `/youtube/transcript` — returns 404 with a
 *      generic "no transcript" message for both upcoming and
 *      captionless videos, so it can't tell them apart on its own.
 *      Logged for reference.
 *   3. TranscriptAPI `/youtube/channel/latest` — given the channel
 *      id discovered from the scrape, looks up the video and
 *      reports its `published` time. Scheduled videos appear with
 *      a `published` strictly after `now`.
 *
 * Usage:
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchYouTubeVideoInfo.ts --id z3BUXmayt9k
 *
 *   apps/web/scripts/runScriptWithEnv.sh development \
 *     scripts/fetchYouTubeVideoInfo.ts \
 *     --url https://www.youtube.com/watch?v=z3BUXmayt9k
 */
import { program } from 'commander';

import {
  detectScheduledVideo,
  parseScheduledFromHtml,
} from '@/lib/platforms/youtube/scheduledVideo';
import { extractVideoId } from '@/lib/platforms/youtube/videoSnapshot';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

const YT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async () => {
  program
    .option('--id <value>', 'YouTube video ID (11 chars)')
    .option('--url <value>', 'YouTube video URL (any standard shape)')
    .parse(process.argv);
  const { id, url } = program.opts<{ id?: string; url?: string }>();
  if (id == null && url == null) {
    console.error('Provide either --id or --url.');
    process.exit(1);
  }
  if (id != null && url != null) {
    console.error('--id and --url are mutually exclusive.');
    process.exit(1);
  }
  const videoId = id ?? extractVideoId(url!);
  if (videoId == null) {
    console.error(`Could not extract a video id from input: ${url}`);
    process.exit(1);
  }
  console.info(`Video ID: ${videoId}\n`);

  // 1. Watch-page scrape with raw HTML inspection so the operator
  //    can see exactly which signals are present.
  console.info('--- Watch page scrape ---');
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let html: string | null = null;
  try {
    const res = await fetch(watchUrl, {
      headers: { 'User-Agent': YT_USER_AGENT },
      cache: 'no-store',
    });
    console.info(`GET ${watchUrl}\nHTTP ${res.status}`);
    if (res.ok) {
      html = await res.text();
    }
  } catch (err) {
    console.error('Scrape failed:', err);
  }

  let channelIdFromScrape: string | null = null;
  if (html != null) {
    const upcoming = html.match(/"isUpcoming"\s*:\s*(true|false)/);
    const liveContent = html.match(/"isLiveContent"\s*:\s*(true|false)/);
    const broadcast = html.match(/"liveBroadcastDetails"\s*:\s*\{[^}]+\}/);
    const scheduledStart = html.match(/"scheduledStartTime"\s*:\s*"(\d+)"/);
    const title = html.match(/<meta name="title" content="([^"]*)"/);
    const channel = html.match(/"channelId"\s*:\s*"(UC[\w-]+)"/);
    console.info(`isUpcoming: ${upcoming?.[1] ?? '(missing)'}`);
    console.info(`isLiveContent: ${liveContent?.[1] ?? '(missing)'}`);
    console.info(`liveBroadcastDetails: ${broadcast?.[0] ?? '(missing)'}`);
    console.info(`scheduledStartTime: ${scheduledStart?.[1] ?? '(missing)'}`);
    console.info(`title: ${title?.[1] ?? '(missing)'}`);
    console.info(`channelId: ${channel?.[1] ?? '(missing)'}`);
    channelIdFromScrape = channel?.[1] ?? null;

    // Run the parser we ship in production to confirm parity.
    const parsed = parseScheduledFromHtml(html);
    console.info(`\nparseScheduledFromHtml -> ${JSON.stringify(parsed, null, 2)}`);
  }

  // 2. TranscriptAPI transcript endpoint — only useful to confirm
  //    it gives us no scheduled-vs-captionless signal on its own.
  console.info('\n--- TranscriptAPI /youtube/transcript ---');
  const apiKey = process.env.TRANSCRIPT_API_KEY;
  if (apiKey == null || apiKey.length === 0) {
    console.warn('TRANSCRIPT_API_KEY not set; skipping TranscriptAPI calls.');
  } else {
    const transcriptUrl = `https://transcriptapi.com/api/v2/youtube/transcript?video_url=${videoId}&send_metadata=true`;
    const res = await fetch(transcriptUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    const body = await res.text();
    console.info(`HTTP ${res.status}`);
    console.info(body.length > 500 ? body.slice(0, 500) + '…' : body);
  }

  // 3. TranscriptAPI /channel/latest — the fallback the production
  //    code uses when the watch page is unreachable. Scheduled
  //    videos appear in the result set with `published > now`.
  console.info('\n--- TranscriptAPI /youtube/channel/latest ---');
  if (channelIdFromScrape == null) {
    console.warn('No channel id available; skipping TranscriptAPI channel lookup.');
  } else if (apiKey == null || apiKey.length === 0) {
    console.warn('TRANSCRIPT_API_KEY not set; skipping.');
  } else {
    const listUrl = `https://transcriptapi.com/api/v2/youtube/channel/latest?channel=${channelIdFromScrape}`;
    const res = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    console.info(`HTTP ${res.status}`);
    if (res.ok) {
      const data = (await res.json()) as {
        results?: Array<{ videoId: string; title: string; published: string }>;
      };
      const match = (data.results ?? []).find((v) => v.videoId === videoId);
      if (match == null) {
        console.info('Video not in the channel/latest result set.');
      } else {
        const published = new Date(match.published);
        const futureBy = published.getTime() - Date.now();
        console.info(
          `Matched: ${match.videoId}  title="${match.title.slice(0, 60)}"  published=${match.published}  in future by ${(futureBy / 1000 / 60).toFixed(1)}min`
        );
      }
    }
  }

  // 4. Run the full detector that ships in production.
  console.info('\n--- detectScheduledVideo(...) ---');
  const detected = await detectScheduledVideo(videoId, {
    channelSourceId: channelIdFromScrape,
  });
  console.info(JSON.stringify(detected, null, 2));
})();
