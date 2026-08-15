import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import { rankByMatchScore } from '@/lib/search/matchScore';
import type { ChannelSearchHit, SearchResponse, VideoSearchHit } from '@/lib/search/types';

/** Most relevant N per section — the palette shows every row returned.
 *  VIDEO_LIMIT applies per match class (title / description), since
 *  each class renders as its own palette section. */
const CHANNEL_LIMIT = 5;
const VIDEO_LIMIT = 8;

// Upper bound on the candidate set we pull for in-process channel
// ranking. A user's subscription list is small (tens to low hundreds),
// so this is a safety valve, not a pagination scheme.
const CHANNEL_CANDIDATE_LIMIT = 100;

/**
 * Sectioned keyword search backing the ⌘K palette. Returns the most
 * relevant N hits per content type — see `lib/search/types.ts` for why
 * only channels and videos are searched today.
 *
 * Videos are matched with plainto_tsquery over Video.search_tsv
 * (title weighted 'A', description 'B', GIN-indexed) so users can type
 * natural queries without AND/OR operators, ranked by ts_rank. Scope is
 * the user's library: videos from subscribed channels, individually
 * added standalone videos, and playlist videos.
 *
 * Channels are matched by name/handle substring over the user's
 * subscriptions and ranked in-process (exact > prefix > word > substring)
 * — a tsvector doesn't help for short single-name labels.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length === 0) {
    return NextResponse.json<SearchResponse>({ channels: [], videos: [] });
  }

  const [channelRows, videoRows] = await Promise.all([
    prisma.channel.findMany({
      where: {
        subscriptions: { some: { user_id: userId } },
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { handle: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, handle: true, source_id: true, logo_url: true },
      take: CHANNEL_CANDIDATE_LIMIT,
    }),
    // plainto_tsquery sanitizes user input (no injection risk from q),
    // but we still parameterize to be strict.
    //
    // The GIN-indexed search_tsv match narrows the candidate set; the
    // per-row work below (title re-match, ROW_NUMBER, ts_headline)
    // only runs on those hits. `title_match` classifies each hit by
    // whether the query terms appear in the title itself — hits that
    // only matched the description render under a separate palette
    // section with a snippet showing why they matched. ROW_NUMBER
    // caps each class at VIDEO_LIMIT independently so a pile of
    // strong title matches can't crowd out every description match
    // (or vice versa).
    prisma.$queryRaw<
      Array<{
        id: string;
        source_id: string;
        title: string;
        published_at: Date | null;
        channel_name: string;
        title_match: boolean;
        description_snippet: string | null;
      }>
    >`
      SELECT
        ranked.id,
        ranked.source_id,
        ranked.title,
        ranked.published_at,
        ranked.channel_name,
        ranked.title_match,
        CASE WHEN ranked.title_match OR ranked.description IS NULL THEN NULL ELSE
          ts_headline(
            'english',
            ranked.description,
            plainto_tsquery('english', ${q}),
            'StartSel=[[, StopSel=]], MaxFragments=1, MaxWords=18, MinWords=8'
          )
        END AS description_snippet
      FROM (
        SELECT
          v."id"           AS id,
          v."source_id"    AS source_id,
          v."title"        AS title,
          v."description"  AS description,
          v."published_at" AS published_at,
          c."name"         AS channel_name,
          to_tsvector('english', v."title") @@ plainto_tsquery('english', ${q}) AS title_match,
          ts_rank(v."search_tsv", plainto_tsquery('english', ${q})) AS rank,
          ROW_NUMBER() OVER (
            PARTITION BY to_tsvector('english', v."title") @@ plainto_tsquery('english', ${q})
            ORDER BY
              ts_rank(v."search_tsv", plainto_tsquery('english', ${q})) DESC,
              v."published_at" DESC NULLS LAST
          ) AS row_in_class
        FROM "Video" v
        JOIN "Channel" c ON c."id" = v."channel_id"
        WHERE v."search_tsv" @@ plainto_tsquery('english', ${q})
          AND (
            v."channel_id" IN (
              SELECT "channel_id" FROM "UserSubscription" WHERE "user_id" = ${userId}
            )
            OR v."id" IN (
              SELECT "video_id" FROM "StandaloneVideo" WHERE "user_id" = ${userId}
            )
            OR v."id" IN (
              SELECT pv."video_id"
              FROM "PlaylistVideo" pv
              JOIN "Playlist" p ON p."id" = pv."playlist_id"
              WHERE p."user_id" = ${userId}
            )
          )
      ) ranked
      WHERE ranked.row_in_class <= ${VIDEO_LIMIT}
      ORDER BY
        ranked.title_match DESC,
        ranked.rank DESC,
        ranked.published_at DESC NULLS LAST
    `,
  ]);

  const channels: ChannelSearchHit[] = rankByMatchScore(
    channelRows,
    q,
    (c) => [c.name, c.handle],
    (c) => c.name
  )
    .slice(0, CHANNEL_LIMIT)
    .map((c) => ({
      id: c.id,
      name: c.name,
      handle: c.handle,
      sourceId: c.source_id,
      logoUrl: c.logo_url,
    }));

  const videos: VideoSearchHit[] = videoRows.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    channelName: row.channel_name,
    publishedAt: row.published_at?.toISOString() ?? null,
    matchedBy: row.title_match ? 'title' : 'description',
    descriptionSnippet: row.description_snippet,
  }));

  return NextResponse.json<SearchResponse>({ channels, videos });
}
