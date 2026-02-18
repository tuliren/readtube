import { NextRequest, NextResponse } from 'next/server';

import { fetchSubtitleViaYoutubei } from '@/lib/subtitles';

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get('v');

  if (!videoId) {
    return NextResponse.json({ error: 'Missing "v" query parameter' }, { status: 400 });
  }

  try {
    const result = await fetchSubtitleViaYoutubei(videoId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to fetch subtitle' },
      { status: 500 }
    );
  }
}
