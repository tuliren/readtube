import { Prisma, prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';
import {
  buildCjkSnippet,
  containsCjk,
  likePattern,
  markMatches,
  searchTerms,
} from '@/lib/search/cjk';
import { rankByMatchScore } from '@/lib/search/matchScore';
import type { ChannelSearchHit, SearchResponse, VideoSearchHit } from '@/lib/search/types';
import { videoMarkedByUserSql } from '@/lib/videos/marks';

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
 * Videos are matched one of two ways:
 *   - Latin-script queries: plainto_tsquery over Video.search_tsv
 *     (title weighted 'A', description 'B', GIN-indexed), ranked by
 *     ts_rank — natural queries with stemming, no AND/OR operators.
 *   - Queries containing CJK: the english-config tsvector can't
 *     tokenize unsegmented CJK text, so every whitespace-delimited
 *     term must match title or description as a case-insensitive
 *     substring (ILIKE backed by the pg_trgm GIN indexes), ordered by
 *     recency.
 * Both paths classify hits by whether the title alone matched and cap
 * each class at VIDEO_LIMIT (see the palette's per-class sections),
 * and both delimit hit terms with `[[` `]]` for client-side <mark>
 * rendering. Scope is the user's library: subscribed channels,
 * standalone videos, and playlist videos.
 *
 * Channels are matched by name/handle substring over the user's
 * subscriptions and ranked in-process (exact > prefix > word >
 * substring) — a tsvector doesn't help for short single-name labels,
 * and substring matching handles CJK names natively.
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

  const [channelRows, videos] = await Promise.all([
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
    containsCjk(q) ? searchVideosBySubstring(userId, q) : searchVideosByTsquery(userId, q),
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

  return NextResponse.json<SearchResponse>({ channels, videos });
}

/**
 * Restrict a video query to the user's library: videos from subscribed
 * channels, individually added standalone videos, playlist videos, and
 * videos the user marked (star / Read Later / note). The mark arm keeps
 * a starred or annotated video findable after its channel is removed —
 * it's the same reachability rule `videoReachableByUser` applies to the
 * reader and the triage endpoints.
 */
function libraryScopeSql(userId: string): Prisma.Sql {
  return Prisma.sql`(
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
    OR ${videoMarkedByUserSql(userId, Prisma.sql`v."id"`)}
  )`;
}

/**
 * Full-text path for Latin-script queries.
 *
 * plainto_tsquery sanitizes user input (no injection risk from q), but
 * we still parameterize to be strict. The GIN-indexed search_tsv match
 * narrows the candidate set; the per-row work (title re-match,
 * ROW_NUMBER, ts_headline) only runs on those hits. `title_match`
 * classifies each hit by whether the query terms appear in the title
 * itself; ROW_NUMBER caps each class at VIDEO_LIMIT independently so a
 * pile of strong title matches can't crowd out every description match
 * (or vice versa).
 */
async function searchVideosByTsquery(userId: string, q: string): Promise<VideoSearchHit[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      source_id: string;
      title: string;
      title_highlight: string;
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
      ts_headline(
        'english',
        ranked.title,
        plainto_tsquery('english', ${q}),
        'StartSel=[[, StopSel=]], HighlightAll=TRUE'
      ) AS title_highlight,
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
        AND ${libraryScopeSql(userId)}
    ) ranked
    WHERE ranked.row_in_class <= ${VIDEO_LIMIT}
    ORDER BY
      ranked.title_match DESC,
      ranked.rank DESC,
      ranked.published_at DESC NULLS LAST
  `;

  return rows.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    titleHighlight: row.title_highlight,
    channelName: row.channel_name,
    publishedAt: row.published_at?.toISOString() ?? null,
    matchedBy: row.title_match ? 'title' : 'description',
    descriptionSnippet: row.description_snippet,
  }));
}

/**
 * Substring path for queries containing CJK — see the route comment.
 * Every term must appear in the title or description (ILIKE, pg_trgm
 * GIN indexes); a hit whose title contains every term classifies as a
 * title match. Ordering is by recency since there's no ts_rank without
 * tokenization. Highlights and the description snippet are computed
 * in-process (`markMatches` / `buildCjkSnippet`) on the ≤ 2×VIDEO_LIMIT
 * returned rows, mirroring ts_headline's `[[` `]]` delimiters.
 */
async function searchVideosBySubstring(userId: string, q: string): Promise<VideoSearchHit[]> {
  const terms = searchTerms(q);
  if (terms.length === 0) {
    return [];
  }
  const anyFieldMatch = Prisma.join(
    terms.map(
      (term) =>
        Prisma.sql`(v."title" ILIKE ${likePattern(term)} OR v."description" ILIKE ${likePattern(term)})`
    ),
    ' AND '
  );
  const titleMatch = Prisma.join(
    terms.map((term) => Prisma.sql`v."title" ILIKE ${likePattern(term)}`),
    ' AND '
  );

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      source_id: string;
      title: string;
      description: string | null;
      published_at: Date | null;
      channel_name: string;
      title_match: boolean;
    }>
  >`
    SELECT
      ranked.id,
      ranked.source_id,
      ranked.title,
      ranked.description,
      ranked.published_at,
      ranked.channel_name,
      ranked.title_match
    FROM (
      SELECT
        v."id"           AS id,
        v."source_id"    AS source_id,
        v."title"        AS title,
        v."description"  AS description,
        v."published_at" AS published_at,
        c."name"         AS channel_name,
        (${titleMatch}) AS title_match,
        ROW_NUMBER() OVER (
          PARTITION BY (${titleMatch})
          ORDER BY v."published_at" DESC NULLS LAST
        ) AS row_in_class
      FROM "Video" v
      JOIN "Channel" c ON c."id" = v."channel_id"
      WHERE (${anyFieldMatch})
        AND ${libraryScopeSql(userId)}
    ) ranked
    WHERE ranked.row_in_class <= ${VIDEO_LIMIT}
    ORDER BY
      ranked.title_match DESC,
      ranked.published_at DESC NULLS LAST
  `;

  return rows.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    titleHighlight: markMatches(row.title, terms),
    channelName: row.channel_name,
    publishedAt: row.published_at?.toISOString() ?? null,
    matchedBy: row.title_match ? 'title' : 'description',
    descriptionSnippet:
      row.title_match || row.description == null ? null : buildCjkSnippet(row.description, terms),
  }));
}
