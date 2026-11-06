import type { Prisma } from '@readtube/database';

interface SummaryContentFields {
  headline: string | null;
  short: string | null;
  full: string | null;
}

/**
 * A summary row is servable only when every field is filled in. The
 * columns are nullable and a READY row isn't guaranteed to have all
 * three, so an incomplete row must neither count as cached nor be
 * served on a public share page.
 *
 * `COMPLETE_SUMMARY_WHERE` is the query-side filter and
 * `isCompleteSummary` the in-memory check for the same rule.
 */
export const COMPLETE_SUMMARY_WHERE = {
  headline: { not: null },
  short: { not: null },
  full: { not: null },
} satisfies Prisma.SummaryWhereInput;

export function isCompleteSummary<T extends SummaryContentFields>(
  row: T | null
): row is T & { headline: string; short: string; full: string } {
  return row != null && row.headline != null && row.short != null && row.full != null;
}
