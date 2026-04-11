import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';

interface Params {
  params: Promise<{ channelId: string }>;
}

/**
 * Move a channel subscription into a folder (or back to the root by passing
 * null). This is called by the sidebar's drag-and-drop handler and the
 * "Move to folder" action in the channel context menu.
 *
 * Route is keyed on channelId (not subscription id) because the client
 * already knows the channel it's moving, and UserSubscription is queried
 * via the (user_id, channel_id) unique index anyway.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;
  const { channelId } = await params;

  let body: { folderId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Normalize: absent / undefined / null / '' all mean "move to root".
  const folderId =
    body.folderId === undefined || body.folderId === null || body.folderId === ''
      ? null
      : body.folderId;

  // Verify the folder belongs to this user before pointing a subscription
  // at it. Without this check, a user could assign their subscription to
  // another user's folder id and cause a leak via the JOIN in the sidebar
  // query.
  if (folderId != null) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, user_id: userId },
      select: { id: true },
    });
    if (folder == null) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }
  }

  const result = await prisma.userSubscription.updateMany({
    where: { user_id: userId, channel_id: channelId },
    data: { folder_id: folderId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  }

  return NextResponse.json({ folderId });
}
