import type { PrismaClient } from '@readtube/database';

import type { InboxQuery, VideoData } from '@/lib/types';

import { buildUnreadClause, buildVideoWhere } from './buildWhere';
import { PAGE_SIZE, extractInboxSearchParams, parseInboxQuery } from './filter';
import { decorateVideo, loadTriageContext } from './triage';

/**
 * Shape returned by `loadInboxVideos`. The total is the count of
 * videos that match the where clause BEFORE pagination, so the
 * client can render Page X of N controls in the inbox header.
 */
export interface InboxVideosResult {
  videos: VideoData[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Single source of truth for "given a user and an InboxQuery, what
 * videos should the inbox show". Both `/api/videos` and the SSR
 * pages call into this so the server-rendered initial paint is
 * always the same set the client-side SWR fetch will return.
 *
 * Returns `{ videos, total, page, pageSize }`. `videos` is one
 * page of results (capped at PAGE_SIZE) and `total` is the count
 * of rows that match the where clause BEFORE pagination, so the
 * client can render Page X of N controls in the inbox header.
 *
 * Before this helper, the SSR pages only honored `channelId` and
 * did archive/snooze filtering in JS after a wide findMany. That
 * meant landing directly on `/inbox?starred=1` SSR-rendered every
 * video, and InboxShell used that as `fallbackData` for the
 * filtered key — the user briefly saw the unfiltered list flash
 * before SWR resolved. Centralizing the logic eliminates the
 * divergence.
 */
export async function loadInboxVideos(
  prisma: PrismaClient,
  userId: string,
  query: InboxQuery
): Promise<InboxVideosResult> {
  const requestedPage = Math.max(1, query.page ?? 1);

  const userSubs = await prisma.userSubscription.findMany({
    where: { user_id: userId },
    select: { channel_id: true, read_at: true },
  });
  const channelIds = userSubs.map((s) => s.channel_id);
  if (channelIds.length === 0) {
    return { videos: [], total: 0, page: 1, pageSize: PAGE_SIZE };
  }
  const watermarkByChannelId = new Map<string, Date | null>(
    userSubs.map((s) => [s.channel_id, s.read_at])
  );

  // Free-text q goes through Postgres `search_tsv @@ plainto_tsquery`.
  // Prisma can't express @@ via the generated client, so we resolve a
  // restricted id set via $queryRaw and AND it into the main findMany.
  // Mirrors what /api/videos does — kept here verbatim so SSR and API
  // can never diverge on search semantics.
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
      return { videos: [], total: 0, page: 1, pageSize: PAGE_SIZE };
    }
  }

  const baseWhere = buildVideoWhere(query, userId, channelIds);
  let where: typeof baseWhere =
    restrictIds != null ? { ...baseWhere, id: { in: restrictIds } } : baseWhere;

  // Push unread into the DB query so pagination applies to the
  // already-filtered set rather than dropping genuinely unread videos
  // beyond the page boundary.
  if (query.unread === true) {
    where = {
      AND: [where, buildUnreadClause(userId, channelIds, watermarkByChannelId)],
    };
  }

  const sortDirection = query.sort === 'oldest' ? 'asc' : 'desc';

  // Run count first so we can clamp the requested page against the
  // actual result set BEFORE running findMany. Without this, a
  // bookmark like /inbox?starred=1&page=5 against a Starred bucket
  // that has since shrunk to 30 videos would return zero rows for
  // skip=100 — leaving the user looking at "Page 5 of 2" with an
  // empty list. Clamping serializes the two queries (one extra
  // round-trip) but the cost is small (~5ms) for a properly indexed
  // COUNT(*).
  //
  // When total is 0 we still want to surface page 1 (the pagination
  // control hides itself when total <= PAGE_SIZE anyway).
  const total = await prisma.video.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const skip = (page - 1) * PAGE_SIZE;

  const videos = await prisma.video.findMany({
    where,
    orderBy: { published_at: sortDirection },
    select: {
      id: true,
      source_id: true,
      title: true,
      description: true,
      published_at: true,
      duration_seconds: true,
      thumbnail_url: true,
      transcript_unavailable: true,
      channel_id: true,
      channel: { select: { id: true, name: true, source_id: true, handle: true } },
      consumptions: {
        where: { user_id: userId },
        select: { read_at: true },
        take: 1,
      },
      // Latest Transcript row (if any) plus minimal presence-check
      // payloads for its Summary and Articles. We only need the
      // existence answers to render the artifact badges in VideoRow,
      // so each child select picks the cheapest possible columns:
      // a single Summary field via the unique transcript_id, and
      // a single Article id with take: 1.
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: {
          summary: { select: { transcript_id: true } },
          articles: { take: 1, select: { id: true } },
        },
      },
    },
    skip,
    take: PAGE_SIZE,
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

  const triage = await loadTriageContext(
    prisma,
    userId,
    videos.map((v) => v.id)
  );

  return {
    videos: videos.map((v) => decorateVideo(v, triage, readAtFor(v))),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

/**
 * Convert Next.js's `searchParams` object (the awaited shape returned
 * by an App Router page's `searchParams: Promise<{...}>` prop) into
 * the URLSearchParams that `parseInboxQuery` expects. SSR pages don't
 * have a `request.nextUrl.searchParams` to hand off, so this small
 * adapter keeps both call sites going through the canonical codec.
 *
 * Also unwraps the `returnTo` indirection used by the reader Back-
 * button flow: when the URL is
 * `/inbox/<id>?returnTo=channelId%3Dabc%26starred%3D1` the inner
 * query is what we actually want to filter against.
 */
export function searchParamsToInboxQuery(
  raw: Record<string, string | string[] | undefined>
): InboxQuery {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const v of value) {
        params.append(key, v);
      }
    } else {
      params.set(key, value);
    }
  }
  return parseInboxQuery(extractInboxSearchParams(params));
}
