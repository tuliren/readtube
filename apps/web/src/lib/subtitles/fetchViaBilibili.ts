import type { SubtitleResult, TranscriptSegment } from './types';
import { SubtitleFetchError } from './types';

const BILIBILI_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://www.bilibili.com/',
};

/** Bilibili's video info response (relevant fields). */
interface BilibiliVideoInfo {
  aid: number;
  bvid: string;
  cid: number;
  title: string;
  owner: { name: string };
  pages: { cid: number; part: string; page: number }[];
}

/** A single subtitle track entry from the player API. */
interface BilibiliSubtitleTrack {
  lan: string;
  lan_doc: string;
  subtitle_url: string;
  ai_type: number; // 0 = human, 1 = AI-generated
}

/** A single segment in the subtitle body JSON. */
interface BilibiliSubtitleSegment {
  from: number; // seconds (float)
  to: number; // seconds (float)
  content: string;
}

/**
 * Extract a BV ID from a bilibili URL.
 * Supports formats like:
 *   https://www.bilibili.com/video/BV17x411w7KC
 *   https://www.bilibili.com/video/BV17x411w7KC/
 *   https://www.bilibili.com/video/BV17x411w7KC?p=2
 *   https://b23.tv/BV17x411w7KC  (short links redirect, but BV ID may appear)
 */
export function extractBilibiliVideoId(urlOrId: string): string | null {
  // Direct BV ID (no URL)
  if (/^BV[a-zA-Z0-9]{10}$/.test(urlOrId)) {
    return urlOrId;
  }

  const match = urlOrId.match(/BV[a-zA-Z0-9]{10}/);
  return match ? match[0] : null;
}

/**
 * Extract the page number (?p=N) from a bilibili URL. Returns 1 if absent.
 */
function extractPageNumber(url: string): number {
  const match = url.match(/[?&]p=(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * Fetch the transcript for a bilibili video.
 *
 * Requires a valid SESSDATA cookie (from a logged-in bilibili account)
 * because the subtitle API returns empty results without authentication.
 *
 * @param bvid - The BV ID of the video (e.g., "BV17x411w7KC")
 * @param opts.sessdata - The SESSDATA cookie value from a logged-in bilibili session
 * @param opts.page - The page/part number for multi-part videos (default: 1)
 * @param opts.preferredLanguage - Preferred language code (e.g., "zh-CN", "en"). Falls back to first available.
 */
export async function fetchSubtitleViaBilibili(
  bvid: string,
  opts: {
    sessdata: string;
    page?: number;
    preferredLanguage?: string;
  }
): Promise<SubtitleResult> {
  const { sessdata, page = 1, preferredLanguage } = opts;

  // 1. Fetch video info to get aid + cid
  const infoRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
    headers: BILIBILI_HEADERS,
  });

  if (!infoRes.ok) {
    throw new SubtitleFetchError(`Failed to fetch bilibili video info (HTTP ${infoRes.status})`, {
      transient: infoRes.status >= 500 || infoRes.status === 429,
      status: infoRes.status,
    });
  }

  const infoJson = (await infoRes.json()) as {
    code: number;
    message: string;
    data: BilibiliVideoInfo;
  };

  if (infoJson.code !== 0) {
    const isPermanent = infoJson.code === -404 || infoJson.code === 62002; // not found / not visible
    throw new SubtitleFetchError(
      `Bilibili API error: ${infoJson.message} (code ${infoJson.code})`,
      { transient: !isPermanent, status: undefined }
    );
  }

  const videoInfo = infoJson.data;
  const pageEntry = videoInfo.pages[page - 1];
  if (pageEntry == null) {
    throw new SubtitleFetchError(
      `Page ${page} not found. Video has ${videoInfo.pages.length} page(s).`,
      { transient: false }
    );
  }

  const { aid } = videoInfo;
  const cid = pageEntry.cid;

  // 2. Fetch subtitle list from the player API (requires SESSDATA)
  const playerRes = await fetch(`https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`, {
    headers: {
      ...BILIBILI_HEADERS,
      Cookie: `SESSDATA=${sessdata}`,
    },
  });

  if (!playerRes.ok) {
    throw new SubtitleFetchError(
      `Failed to fetch bilibili player info (HTTP ${playerRes.status})`,
      {
        transient: playerRes.status >= 500 || playerRes.status === 429,
        status: playerRes.status,
      }
    );
  }

  const playerJson = (await playerRes.json()) as {
    code: number;
    data: {
      subtitle: {
        subtitles: BilibiliSubtitleTrack[];
      };
    };
  };

  if (playerJson.code !== 0) {
    throw new SubtitleFetchError(`Bilibili player API error (code ${playerJson.code})`, {
      transient: true,
    });
  }

  const subtitleTracks = playerJson.data.subtitle.subtitles;
  if (subtitleTracks.length === 0) {
    throw new SubtitleFetchError(
      'No subtitles available for this video. The video may not have captions, or SESSDATA may be invalid/expired.',
      { transient: false }
    );
  }

  // 3. Pick the best subtitle track
  let track: BilibiliSubtitleTrack;
  if (preferredLanguage != null) {
    const preferred = subtitleTracks.find((t) => t.lan === preferredLanguage);
    track = preferred ?? subtitleTracks[0];
  } else {
    // Prefer human-uploaded (ai_type === 0) over AI-generated
    const manual = subtitleTracks.find((t) => t.ai_type === 0);
    track = manual ?? subtitleTracks[0];
  }

  // 4. Fetch the actual subtitle content
  let subtitleUrl = track.subtitle_url;
  if (subtitleUrl.startsWith('//')) {
    subtitleUrl = `https:${subtitleUrl}`;
  }

  const subtitleRes = await fetch(subtitleUrl, {
    headers: { 'User-Agent': BILIBILI_HEADERS['User-Agent'] },
  });

  if (!subtitleRes.ok) {
    throw new SubtitleFetchError(`Failed to fetch subtitle content (HTTP ${subtitleRes.status})`, {
      transient: subtitleRes.status >= 500 || subtitleRes.status === 429,
      status: subtitleRes.status,
    });
  }

  const subtitleJson = (await subtitleRes.json()) as {
    body: BilibiliSubtitleSegment[];
  };

  // 5. Convert to TranscriptSegment format
  const segments: TranscriptSegment[] = (subtitleJson.body ?? [])
    .filter((seg) => seg.content.trim().length > 0)
    .map((seg) => ({
      startMs: Math.round(seg.from * 1000),
      endMs: Math.round(seg.to * 1000),
      text: seg.content.trim(),
    }));

  if (segments.length === 0) {
    throw new SubtitleFetchError('Subtitle body is empty after parsing.', { transient: false });
  }

  const isAI = track.ai_type === 1;

  return {
    videoId: bvid,
    title: videoInfo.title,
    channel: videoInfo.owner.name,
    language: track.lan,
    languageName: track.lan_doc,
    captionType: isAI ? 'auto-generated' : 'manual',
    segmentCount: segments.length,
    segments,
  };
}
