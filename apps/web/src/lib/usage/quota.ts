import { type PrismaClient, UserRequestType } from '@readtube/database';

/**
 * Per-user monthly generation quota.
 *
 * Only TRANSCRIPT requests count against the quota — summary and
 * article generations are excluded (see T-483). A transcript fetch hits
 * the upstream TranscriptAPI and is the unit of cost we meter; the LLM
 * summary/article steps are layered on top and tracked separately in
 * the `UserRequest` audit log but don't draw down this allowance.
 *
 * This is purely informational today: nothing is blocked when a user
 * crosses it. It's surfaced on the /usage page so users can see where
 * they stand before enforcement (warnings / hard limits) lands. Tune
 * freely — no code below or above this number changes behavior yet.
 */
export const MONTHLY_GENERATION_QUOTA = 100;

export interface GenerationUsage {
  /** Transcript generations the user has spent in the current month. */
  used: number;
  /** The monthly allotment ({@link MONTHLY_GENERATION_QUOTA}). */
  quota: number;
  /** First instant of the current month (UTC), inclusive. */
  periodStart: Date;
  /** First instant of next month (UTC), exclusive — i.e. the reset. */
  periodEnd: Date;
}

/**
 * Calendar-month window (UTC) containing `now`. `start` is the first
 * millisecond of the month (inclusive); `end` is the first millisecond
 * of the next month (exclusive), so a `created_at` filter reads
 * `{ gte: start, lt: end }`. UTC keeps the boundary deterministic and
 * independent of server timezone.
 */
export function getMonthlyQuotaPeriod(now: Date): { start: Date; end: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 1)),
  };
}

/**
 * Count the transcript generations a user has made in the calendar
 * month containing `now`. Every TRANSCRIPT-type `UserRequest` counts
 * regardless of outcome: both GENERATED and UNAVAILABLE represent a
 * real upstream fetch that bore cost (the FAILED outcome only ever
 * attaches to summary/article rows — see the `UserRequestOutcome`
 * enum).
 */
export async function countMonthlyTranscriptGenerations(
  prisma: PrismaClient,
  userId: string,
  now: Date
): Promise<number> {
  const { start, end } = getMonthlyQuotaPeriod(now);
  return prisma.userRequest.count({
    where: {
      user_id: userId,
      type: UserRequestType.TRANSCRIPT,
      created_at: { gte: start, lt: end },
    },
  });
}

/**
 * Assemble the usage snapshot for the /usage page: transcript
 * generations spent this month against the monthly quota, plus the
 * period bounds for display.
 */
export async function getGenerationUsage(
  prisma: PrismaClient,
  userId: string,
  now: Date
): Promise<GenerationUsage> {
  const { start, end } = getMonthlyQuotaPeriod(now);
  const used = await countMonthlyTranscriptGenerations(prisma, userId, now);
  return {
    used,
    quota: MONTHLY_GENERATION_QUOTA,
    periodStart: start,
    periodEnd: end,
  };
}

export interface LifetimeUsage {
  /** Total transcript generations ever — the metered unit. */
  transcript: number;
  /** Total summary generations ever. */
  summary: number;
  /** Total article generations ever. */
  article: number;
}

/**
 * All-time generation counts for a user, broken down by request type.
 * Counts every `UserRequest` row regardless of outcome, mirroring the
 * monthly metric: a row exists only for a request that actually did
 * work (cache hits and zero-cost short-circuits are never written), so
 * each row is a genuine generation. A single grouped query keeps this
 * to one round trip.
 */
export async function getLifetimeUsage(
  prisma: PrismaClient,
  userId: string
): Promise<LifetimeUsage> {
  const rows = await prisma.userRequest.groupBy({
    by: ['type'],
    where: { user_id: userId },
    _count: { _all: true },
  });
  const countFor = (type: UserRequestType): number =>
    rows.find((row) => row.type === type)?._count._all ?? 0;
  return {
    transcript: countFor(UserRequestType.TRANSCRIPT),
    summary: countFor(UserRequestType.SUMMARY),
    article: countFor(UserRequestType.ARTICLE),
  };
}
