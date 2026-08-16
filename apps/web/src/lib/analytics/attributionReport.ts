/**
 * Pure aggregation logic for the signup attribution report
 * (`scripts/reportSignupAttribution.ts`). Kept separate from the script so it
 * can be unit tested without a database.
 */

export const GROUP_BY_OPTIONS = [
  'channel',
  'source',
  'medium',
  'campaign',
  'term',
  'content',
  'landing',
] as const;

export type GroupBy = (typeof GROUP_BY_OPTIONS)[number];

export interface AttributionFunnelInput {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  landing_page: string | null;
  // Per-user funnel counts joined in by the script's query.
  channels: number;
  standalone_videos: number;
  consumed_videos: number;
  generations: number;
}

export interface AttributionFunnelRow {
  group: string;
  signups: number;
  activated: number;
  consumed: number;
  generations: number;
}

const NONE = '(none)';

export function extractHostname(referrer: string | null): string | null {
  if (referrer == null) {
    return null;
  }
  try {
    return new URL(referrer).hostname;
  } catch {
    return null;
  }
}

/**
 * Collapse a row to its effective source, mirroring the `signed_up` analytics
 * event: `utm_source` → referrer hostname → "organic".
 */
export function collapseSource(
  row: Pick<AttributionFunnelInput, 'utm_source' | 'referrer'>
): string {
  if (row.utm_source != null) {
    return row.utm_source;
  }
  return extractHostname(row.referrer) ?? 'organic';
}

function groupKey(row: AttributionFunnelInput, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'channel':
      return [collapseSource(row), row.utm_medium ?? NONE, row.utm_campaign ?? NONE].join(' / ');
    case 'source':
      return collapseSource(row);
    case 'medium':
      return row.utm_medium ?? NONE;
    case 'campaign':
      return row.utm_campaign ?? NONE;
    case 'term':
      return row.utm_term ?? NONE;
    case 'content':
      return row.utm_content ?? NONE;
    case 'landing':
      return row.landing_page ?? NONE;
  }
}

/**
 * Aggregate per-signup rows into funnel rows: signups → activated (subscribed
 * to a channel or added a standalone video) → consumed (read at least one
 * video), plus total generation requests. Sorted by signups descending.
 */
export function groupAttributionRows(
  rows: AttributionFunnelInput[],
  groupBy: GroupBy
): AttributionFunnelRow[] {
  const groups = new Map<string, AttributionFunnelRow>();

  for (const row of rows) {
    const key = groupKey(row, groupBy);
    let group = groups.get(key);
    if (group == null) {
      group = { group: key, signups: 0, activated: 0, consumed: 0, generations: 0 };
      groups.set(key, group);
    }
    group.signups += 1;
    if (row.channels > 0 || row.standalone_videos > 0) {
      group.activated += 1;
    }
    if (row.consumed_videos > 0) {
      group.consumed += 1;
    }
    group.generations += row.generations;
  }

  return Array.from(groups.values()).sort((a, b) => b.signups - a.signups);
}
