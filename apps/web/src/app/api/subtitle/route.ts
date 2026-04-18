import { NextRequest, NextResponse } from 'next/server';

import {
  fetchSubtitleViaHtmlScraping,
  fetchSubtitleViaYoutubei,
} from '@/lib/platforms/youtube/subtitles';

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get('v');
  if (videoId == null) {
    console.error('[subtitle/GET] Missing query parameter v');
    return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
  }

  const method = request.nextUrl.searchParams.get('method') ?? 'youtubei';
  if (method !== 'youtubei' && method !== 'scraping') {
    console.error(`[subtitle/GET] Invalid method: ${method}`);
    return NextResponse.json({ error: 'Invalid query parameter' }, { status: 400 });
  }

  console.info(`[subtitle/GET] Fetching subtitle for video ${videoId} via ${method}`);

  try {
    const result =
      method === 'youtubei'
        ? await fetchSubtitleViaYoutubei(videoId)
        : await fetchSubtitleViaHtmlScraping(videoId);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[subtitle/GET] Failed to fetch subtitle for video ${videoId}:`, err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to fetch subtitle' },
      { status: 500 }
    );
  }
}
