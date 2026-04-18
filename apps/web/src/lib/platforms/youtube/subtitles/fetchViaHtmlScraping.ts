import type { TranscriptSegment } from '@/lib/platforms/types';
import { UNKNOWN_CHANNEL_NAME, UNKNOWN_VIDEO_TITLE } from '@/lib/platforms/youtube/constants';

import {
  BROWSER_HEADERS,
  extractJsonFromHtml,
  parseCaptionTracks,
  pickNativeTrack,
} from './helpers';
import type { CaptionEvent, SubtitleResult } from './types';

export async function fetchSubtitleViaHtmlScraping(videoId: string): Promise<SubtitleResult> {
  // 1. Fetch the YouTube watch page
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: BROWSER_HEADERS,
  });

  if (!pageRes.ok) {
    throw new Error(`Failed to fetch YouTube page (HTTP ${pageRes.status})`);
  }

  const html = await pageRes.text();

  // 2. Extract ytInitialPlayerResponse embedded in the page HTML
  const playerResponse = extractJsonFromHtml(html, 'ytInitialPlayerResponse = ');
  if (!playerResponse) {
    throw new Error(
      'Could not parse ytInitialPlayerResponse. YouTube may have changed its page format.'
    );
  }

  const videoDetails = playerResponse.videoDetails as Record<string, unknown> | undefined;
  const title = (videoDetails?.title as string) ?? UNKNOWN_VIDEO_TITLE;
  const channel = (videoDetails?.author as string) ?? UNKNOWN_CHANNEL_NAME;

  // 3. Find caption tracks
  const tracks = parseCaptionTracks(playerResponse);
  if (tracks.length === 0) {
    throw new Error('No caption tracks found. This video may not have subtitles enabled.');
  }

  const track = pickNativeTrack(tracks);

  // 4. Fetch captions in JSON format from the timedtext endpoint
  const captionRes = await fetch(`${track.baseUrl}&fmt=json3`, {
    headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] },
  });

  if (!captionRes.ok) {
    throw new Error(`Failed to fetch caption data (HTTP ${captionRes.status})`);
  }

  const captionData = (await captionRes.json()) as { events?: CaptionEvent[] };

  // 5. Parse events into segments
  const segments: TranscriptSegment[] = (captionData.events ?? [])
    .filter((e) => e.segs && e.segs.length > 0)
    .map((e) => ({
      startMs: e.tStartMs,
      endMs: e.tStartMs + (e.dDurationMs ?? 0),
      text: e
        .segs!.map((s) => s.utf8)
        .join('')
        .trim(),
    }))
    .filter((seg) => seg.text.length > 0);

  if (segments.length === 0) {
    throw new Error('Transcript is empty after parsing.');
  }

  return {
    videoId,
    title,
    channel,
    language: track.languageCode,
    languageName: track.name,
    captionType: track.kind === 'asr' ? 'auto-generated' : 'manual',
    segmentCount: segments.length,
    segments,
  };
}
