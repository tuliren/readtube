import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { loadChannelPreview } from '@/lib/onboarding/preview';

/**
 * A channel's details and newest videos for the onboarding preview.
 * 404s for channels the onboarding page couldn't offer.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const { id } = await params;
  const preview = await loadChannelPreview(prisma, id);
  if (preview == null) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }
  return NextResponse.json(preview);
}
