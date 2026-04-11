import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { buildUnreadClause, buildVideoWhere } from '@/lib/inbox/buildWhere';
import { parseInboxQuery } from '@/lib/inbox/filter';
import { decorateVideo, loadTriageContext } from '@/lib/inbox/triage';

export async function GET(request: NextRequest) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  // Back-compat: older clients used ?channelId=<id>. The new client uses
  // ?channelId=<id> through parseInboxQuery as well, so this is a no-op
  // fallthrough — the new codec reads the same key.
  const query = parseInboxQuery(request.nextUrl.searchParams);

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

  if (query.channelId != null && !channelIds.includes(query.channelId)) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const where = buildVideoWhere(query, userId, channelIds);

  const sortDirection = query.sort === 'oldest' ? 'asc' : 'desc';

  // Free-text q filters at the DB level via search_tsv + plainto_tsquery.
  // We AND it with the existing `where` predicate by translating to a raw
  // Prisma `OR` is the wrong shape — instead, switch to `AND: [where, tsquery]`.
  // We can't express @@ through the generated client, so we fall through to
  // a two-step: fetch matching ids via a raw tsvector query first, then
  // pass them into findMany's id filter. Small enough result sets that a
  // single extra round-trip is fine.
  let restrictIds: string[] | null = null;
  if (query.q != null && query.q.length > 0) {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Video"
      WHERE "search_tsv" @@ plainto_tsquery('english', ${query.q})
        AND "channel_id" IN (
          SELECT "channel_id" FROM "UserSubscription" WHERE "user_id" = ${userId}
        )
      LIMIT 500
    `;
    restrictIds = rows.map((r) => r.id);
    if (restrictIds.length === 0) {
      return NextResponse.json([]);
    }
  }

  let finalWhere: typeof where =
    restrictIds != null ? { ...where, id: { in: restrictIds } } : where;

  // Push the unread filter into the DB query (was a JS post-filter
  // applied AFTER take: 500, which silently dropped genuinely unread
  // videos beyond the cap whenever the user had a long backlog of read
  // items mixed in). Wrapping in a top-level AND avoids fighting any
  // existing AND that buildVideoWhere may have added for tag filters.
  if (query.unread === true) {
    finalWhere = {
      AND: [finalWhere, buildUnreadClause(userId, channelIds, watermarkByChannelId)],
    };
  }

  const videos = await prisma.video.findMany({
    where: finalWhere,
    orderBy: { published_at: sortDirection },
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
    take: 500,
  });

  type VideoRow = (typeof videos)[number];
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

  // The unread filter is now applied at the DB layer above via
  // buildUnreadClause, so by the time we get here `videos` is already
  // the filtered set. readAtFor is still needed because decorateVideo
  // wants the read-at timestamp on each row.
  const triage = await loadTriageContext(
    prisma,
    userId,
    videos.map((v) => v.id)
  );

  return NextResponse.json(videos.map((v) => decorateVideo(v, triage, readAtFor(v))));
}
