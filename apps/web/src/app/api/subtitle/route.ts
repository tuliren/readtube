import { NextRequest, NextResponse } from 'next/server';

import { fetchSubtitleViaHtmlScraping, fetchSubtitleViaYoutubei } from '@/lib/subtitles';

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get('v');
  if (videoId == null) {
    return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
  }

  const method = request.nextUrl.searchParams.get('method') ?? 'youtubei';
  if (method !== 'youtubei' && method !== 'scraping') {
    return NextResponse.json({ error: 'Invalid query parameter' }, { status: 400 });
  }

  try {
    const result =
      method === 'youtubei'
        ? await fetchSubtitleViaYoutubei(videoId)
        : await fetchSubtitleViaHtmlScraping(videoId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to fetch subtitle' },
      { status: 500 }
    );
  }
}
