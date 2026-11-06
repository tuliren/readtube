import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { loadPublicVideo } from '@/lib/videos/loadPublicVideo';

/**
 * The public reader's view of a video, for the onboarding preview. The
 * same data the share page renders, so it 404s for videos with nothing
 * to read and exposes nothing that isn't already public.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const { id } = await params;
  const video = await loadPublicVideo(prisma, id);
  if (video == null) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }
  return NextResponse.json(video);
}
