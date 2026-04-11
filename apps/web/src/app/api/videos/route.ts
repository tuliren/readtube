import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { decorateVideo, loadTriageContext } from '@/lib/inbox/triage';

export async function GET(request: NextRequest) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  const channelIdParam = request.nextUrl.searchParams.get('channelId');

  // Get all channels user is subscribed to (with watermarks for read state)
  const userSubs = await prisma.userSubscription.findMany({
    where: { user_id: userId },
    select: { channel_id: true, read_at: true },
  });
  const channelIds = userSubs.map((s) => s.channel_id);
  const watermarkByChannelId = new Map<string, Date | null>(
    userSubs.map((s) => [s.channel_id, s.read_at])
  );

  if (channelIds.length === 0) {
    return NextResponse.json([]);
  }

  // If channelId filter is specified, verify it belongs to this user
  if (channelIdParam && !channelIds.includes(channelIdParam)) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  // Scoped to user's channels
  const scopedWhere = channelIdParam
    ? { channel_id: channelIdParam }
    : { channel_id: { in: channelIds } };

  const videos = await prisma.video.findMany({
    where: scopedWhere,
    select: {
      id: true,
      source_id: true,
      title: true,
      description: true,
      published_at: true,
      channel_id: true,
      channel: { select: { id: true, name: true, source_id: true } },
      consumptions: {
        where: { user_id: userId },
        select: { read_at: true },
        take: 1,
      },
    },
  });

  type VideoRow = (typeof videos)[number];
  // A video is "read" if either an explicit consumption row exists OR the
  // user's per-subscription watermark covers it.
  const readAtFor = (v: VideoRow): Date | null => {
    const explicit = v.consumptions[0]?.read_at;
    if (explicit != null) {
      return explicit;
    }
    const watermark = watermarkByChannelId.get(v.channel_id);
    if (watermark != null && v.published_at.getTime() <= watermark.getTime()) {
      return watermark;
    }
    return null;
  };

  const sorted = [...videos].sort((a, b) => b.published_at.getTime() - a.published_at.getTime());

  const triage = await loadTriageContext(
    prisma,
    userId,
    sorted.map((v) => v.id)
  );

  // Hide archived videos and unexpired snoozes from the inbox feed.
  const now = new Date();
  const visible = sorted.filter((v) => {
    if (triage.archivedIds.has(v.id)) {
      return false;
    }
    const snoozeUntil = triage.snoozeById.get(v.id);
    if (snoozeUntil != null && snoozeUntil.getTime() > now.getTime()) {
      return false;
    }
    return true;
  });

  return NextResponse.json(visible.map((v) => decorateVideo(v, triage, readAtFor(v))));
}
