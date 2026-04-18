import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { requireUserId } from '@/lib/auth';

interface SearchHit {
  id: string;
  sourceId: string;
  title: string;
  titleHighlight: string;
  descriptionHighlight: string | null;
  publishedAt: string | null;
  channelId: string;
  channelName: string;
  channelSourceId: string;
  rank: number;
}

/**
 * Full-text search over the user's subscribed videos. Backed by
 * Video.search_tsv (generated STORED column over title + description,
 * with title weighted 'A' and description weighted 'B') and the
 * video_search_tsv_idx GIN index created in the foundation migration.
 *
 * We use plainto_tsquery so users can type natural queries without
 * worrying about AND/OR/& operators, and ts_headline to highlight
 * matches inline. Returns up to 50 results ordered by ts_rank DESC.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const userId = authResult;

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length === 0) {
    return NextResponse.json([]);
  }

  console.info(`[search/GET] Searching "${q}" for user ${userId}`);

  // plainto_tsquery sanitizes user input (no injection risk from q), but we
  // still parameterize to be strict. The scope to the user's channels is
  // enforced by the subquery on UserSubscription.
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      source_id: string;
      title: string;
      title_highlight: string;
      description_highlight: string | null;
      published_at: Date | null;
      channel_id: string;
      channel_name: string;
      channel_source_id: string;
      rank: number;
    }>
  >`
    SELECT
      v."id"             AS id,
      v."source_id"      AS source_id,
      v."title"          AS title,
      ts_headline(
        'english',
        v."title",
        plainto_tsquery('english', ${q}),
        'StartSel=<mark>, StopSel=</mark>, HighlightAll=TRUE'
      ) AS title_highlight,
      CASE WHEN v."description" IS NULL THEN NULL ELSE
        ts_headline(
          'english',
          v."description",
          plainto_tsquery('english', ${q}),
          'StartSel=<mark>, StopSel=</mark>, MaxFragments=1, MaxWords=25, MinWords=10'
        )
      END AS description_highlight,
      v."published_at"   AS published_at,
      v."channel_id"     AS channel_id,
      c."name"           AS channel_name,
      c."source_id"      AS channel_source_id,
      ts_rank(v."search_tsv", plainto_tsquery('english', ${q})) AS rank
    FROM "Video" v
    JOIN "Channel" c ON c."id" = v."channel_id"
    WHERE v."search_tsv" @@ plainto_tsquery('english', ${q})
      AND v."channel_id" IN (
        SELECT "channel_id" FROM "UserSubscription" WHERE "user_id" = ${userId}
      )
    ORDER BY rank DESC, v."published_at" DESC NULLS LAST
    LIMIT 50
  `;

  const hits: SearchHit[] = rows.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    titleHighlight: row.title_highlight,
    descriptionHighlight: row.description_highlight,
    publishedAt: row.published_at?.toISOString() ?? null,
    channelId: row.channel_id,
    channelName: row.channel_name,
    channelSourceId: row.channel_source_id,
    rank: Number(row.rank),
  }));

  return NextResponse.json(hits);
}
