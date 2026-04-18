import { fetchHtmlWithJs } from '@/lib/puppeteer/fetchHtmlWithJs';

import { BVID_PATTERN, buildBilibiliSpaceUrl } from './urls';

export interface ScrapedBilibiliVideo {
  videoId: string;
  url: string;
}

export interface ScrapedBilibiliChannel {
  mid: string;
  videos: ScrapedBilibiliVideo[];
}

/**
 * Scrapes a Bilibili user's upload-list page (`/<mid>/upload/video`) via
 * headless Chromium. The page is client-rendered so plain HTTP can't
 * surface the video list. Returns BV ids in the order they appear —
 * which on the /upload/video tab is publication-date descending.
 *
 * Per-video metadata (title, duration, pubdate) and channel info (name,
 * avatar) are not extracted here — feed each BV id to
 * fetchBilibiliVideoSnapshot() for the canonical snapshot, which also
 * carries `owner.name` / `owner.face` for the channel.
 */
export async function scrapeBilibiliChannel(mid: string): Promise<ScrapedBilibiliChannel> {
  const url = `${buildBilibiliSpaceUrl(mid)}/upload/video`;
  console.info(`[bilibili/channelScrape] scraping mid=${mid} url=${url}`);

  const result = await fetchHtmlWithJs(url);
  if (result == null) {
    throw new Error(`Puppeteer returned null for ${url}`);
  }
  if ('httpStatus' in result) {
    throw new Error(`Failed to fetch ${url}: HTTP ${result.httpStatus}: ${result.error}`);
  }
  const { html, finalUrl } = result;

  // Only match BV ids that appear inside a `/video/BVxxx` path — those
  // are the real uploaded-video links rendered into the DOM. A bare
  // `BV[A-Za-z0-9]{10}` scan would also catch unrelated 12-char tokens
  // (player/component config ids, hashes) that happen to match the
  // pattern but aren't real video ids, producing 404s at fan-out time.
  // Dedup via Set while keeping first-seen order (newest first).
  const bvidCore = BVID_PATTERN.source.slice(1, -1);
  const videoHrefRegex = new RegExp(`/video/(${bvidCore})`, 'g');
  const seen = new Set<string>();
  const videos: ScrapedBilibiliVideo[] = [];
  let match: RegExpExecArray | null;
  while ((match = videoHrefRegex.exec(html)) != null) {
    const videoId = match[1];
    if (seen.has(videoId)) {
      continue;
    }
    seen.add(videoId);
    videos.push({ videoId, url: `https://www.bilibili.com/video/${videoId}/` });
  }

  // If the BV-href regex finds nothing, something upstream is wrong —
  // likely a consent/bot-wall page or a redirect. Log diagnostics so
  // Vercel's log stream reveals it: whether *any* BV tokens appeared at
  // all (even outside /video/ hrefs) and a body-text snippet.
  if (videos.length === 0) {
    const anyBvidRegex = new RegExp(bvidCore, 'g');
    const strayBvidCount = (html.match(anyBvidRegex) ?? []).length;
    console.warn(
      `[bilibili/channelScrape] no /video/BV hrefs found for mid=${mid} finalUrl=${finalUrl} htmlLen=${html.length} strayBvidTokens=${strayBvidCount} — likely a bot wall or empty shell page`
    );
    console.warn(
      `[bilibili/channelScrape] HTML body preview: ${html.slice(0, 500).replace(/\s+/g, ' ')}`
    );
  } else {
    console.info(
      `[bilibili/channelScrape] mid=${mid} finalUrl=${finalUrl} found ${videos.length} BV ids, first 3: ${videos
        .slice(0, 3)
        .map((v) => v.videoId)
        .join(', ')}`
    );
  }

  return { mid, videos };
}
