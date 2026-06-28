import { prisma } from '@readtube/database';

/**
 * Active-user report.
 *
 * One row per user, ordered by most-recent consumption. The "Active Days"
 * column counts the number of distinct calendar days on which the user
 * consumed anything (distinct `read_at::date` over UserVideoConsumption).
 *
 * Note: `read_at::date` truncates using the database session's timezone,
 * so a "day" is a UTC day unless the connection sets another timezone.
 */

const LIMIT = 50;

interface ReportRow {
  name: string | null;
  email: string | null;
  created_at: Date | null;
  active_days: bigint;
  last_consumed_at: Date | null;
  channels: bigint;
  consumed_videos: bigint;
  summaries: bigint;
  articles: bigint;
}

function formatDate(value: Date | null): string {
  return value == null ? '' : value.toISOString().slice(0, 10);
}

function formatUser(name: string | null, email: string | null): string {
  if (name != null && email != null) {
    return `${name} (${email})`;
  }
  return name ?? email ?? '';
}

(async () => {
  try {
    const rows = await prisma.$queryRaw<ReportRow[]>`
      SELECT
        u.name,
        u.email,
        u.created_at,
        COALESCE(c.active_days, 0)         AS active_days,
        c.last_consumed_at,
        COALESCE(s.subscribed_channels, 0) AS channels,
        COALESCE(c.consumed_videos, 0)     AS consumed_videos,
        COALESCE(g.summary_generations, 0) AS summaries,
        COALESCE(g.article_generations, 0) AS articles
      FROM "User" u
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS subscribed_channels
        FROM "UserSubscription"
        GROUP BY user_id
      ) s ON s.user_id = u.source_id
      LEFT JOIN (
        SELECT user_id,
               COUNT(*)                    AS consumed_videos,
               COUNT(DISTINCT read_at::date) AS active_days,
               MAX(read_at)                AS last_consumed_at
        FROM "UserVideoConsumption"
        GROUP BY user_id
      ) c ON c.user_id = u.source_id
      LEFT JOIN (
        SELECT user_id,
               COUNT(*) FILTER (WHERE type = 'SUMMARY') AS summary_generations,
               COUNT(*) FILTER (WHERE type = 'ARTICLE') AS article_generations
        FROM "UserRequest"
        WHERE type IN ('SUMMARY', 'ARTICLE')
          AND outcome = 'GENERATED'
        GROUP BY user_id
      ) g ON g.user_id = u.source_id
      ORDER BY c.last_consumed_at DESC NULLS LAST
      LIMIT ${LIMIT};
    `;

    const table = rows.map((r) => ({
      User: formatUser(r.name, r.email),
      'Created At': formatDate(r.created_at),
      'Active Days': Number(r.active_days),
      'Last Consumed At': formatDate(r.last_consumed_at),
      Channels: Number(r.channels),
      'Consumed Videos': Number(r.consumed_videos),
      Summaries: Number(r.summaries),
      Articles: Number(r.articles),
    }));

    console.table(table);
    console.info(`[activeUsers] ${rows.length} row(s)`);
  } catch (err) {
    console.error('[activeUsers] failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
