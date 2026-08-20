import { prisma } from '@readtube/database';

import {
  type AttributionFunnelInput,
  GROUP_BY_OPTIONS,
  type GroupBy,
  groupAttributionRows,
} from '@/lib/analytics/attributionReport';

/**
 * Signup attribution report (see MARKETING.md).
 *
 * One funnel row per traffic group: signups → activated (subscribed to a
 * channel or added a standalone video) → consumed (read at least one video),
 * plus total generation requests.
 *
 * Usage:
 *   yarn script:prod scripts/reportSignupAttribution.ts --days 30
 *   yarn script:prod scripts/reportSignupAttribution.ts --days 30 --group-by term
 *
 * --group-by: channel (default, source / medium / campaign), source, medium,
 * campaign, term, content, landing.
 */

interface QueryRow extends Omit<
  AttributionFunnelInput,
  'channels' | 'standalone_videos' | 'consumed_videos' | 'generations'
> {
  channels: bigint;
  standalone_videos: bigint;
  consumed_videos: bigint;
  generations: bigint;
}

function parseArgs(argv: string[]): { days: number; groupBy: GroupBy } {
  let days = 30;
  let groupBy: GroupBy = 'channel';

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--days') {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`--days must be a positive integer, got: ${argv[i + 1]}`);
      }
      days = value;
      i++;
    } else if (argv[i] === '--group-by') {
      const value = argv[i + 1] as GroupBy;
      if (!GROUP_BY_OPTIONS.includes(value)) {
        throw new Error(
          `--group-by must be one of ${GROUP_BY_OPTIONS.join(', ')}, got: ${argv[i + 1]}`
        );
      }
      groupBy = value;
      i++;
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }

  return { days, groupBy };
}

(async () => {
  try {
    const { days, groupBy } = parseArgs(process.argv.slice(2));

    const rows = await prisma.$queryRaw<QueryRow[]>`
      SELECT
        sa.utm_source,
        sa.utm_medium,
        sa.utm_campaign,
        sa.utm_term,
        sa.utm_content,
        sa.referrer,
        sa.landing_page,
        COALESCE(s.channels, 0)          AS channels,
        COALESCE(sv.standalone_videos, 0) AS standalone_videos,
        COALESCE(c.consumed_videos, 0)   AS consumed_videos,
        COALESCE(g.generations, 0)       AS generations
      FROM "SignupAttribution" sa
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS channels
        FROM "UserSubscription"
        GROUP BY user_id
      ) s ON s.user_id = sa.user_id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS standalone_videos
        FROM "StandaloneVideo"
        GROUP BY user_id
      ) sv ON sv.user_id = sa.user_id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS consumed_videos
        FROM "UserVideoConsumption"
        GROUP BY user_id
      ) c ON c.user_id = sa.user_id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS generations
        FROM "UserRequest"
        WHERE outcome = 'GENERATED'
        GROUP BY user_id
      ) g ON g.user_id = sa.user_id
      WHERE sa.created_at >= NOW() - make_interval(days => ${days}::int);
    `;

    const inputs: AttributionFunnelInput[] = rows.map((r) => ({
      ...r,
      channels: Number(r.channels),
      standalone_videos: Number(r.standalone_videos),
      consumed_videos: Number(r.consumed_videos),
      generations: Number(r.generations),
    }));

    const report = groupAttributionRows(inputs, groupBy);

    console.table(
      report.map((r) => ({
        [`Group (${groupBy})`]: r.group,
        Signups: r.signups,
        Activated: r.activated,
        Consumed: r.consumed,
        Generations: r.generations,
      }))
    );
    console.info(`[reportSignupAttribution] ${inputs.length} signup(s) in the last ${days} day(s)`);
  } catch (err) {
    console.error('[reportSignupAttribution] failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
