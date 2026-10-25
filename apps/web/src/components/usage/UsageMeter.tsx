import type { ReactNode } from 'react';

interface Props {
  title: string;
  description: ReactNode;
  /** Amount spent in the current month, in the meter's unit. */
  used: number;
  /** Monthly allotment, in the same unit as `used`. */
  quota: number;
  /** Renders a `used` / `quota` / remaining amount for display. */
  format: (value: number) => string;
  /** Unit suffix shown after the quota and the remaining amount. */
  unit?: string;
  /** Accessible name for the progress bar. */
  ariaLabel: string;
  /** First instant of the current month (UTC). */
  periodStart: Date;
  /** First instant of next month (UTC) — the reset point. */
  periodEnd: Date;
  /** Extra detail shown next to the reset date. */
  footnote?: string;
}

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const resetFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Read-only meter for one monthly generation quota. Purely
 * informational — no warning styling or limit enforcement yet (see
 * T-483). The fill is clamped to 100% so an over-quota month (while
 * limits aren't enforced) still renders a sane bar.
 */
export default function UsageMeter({
  title,
  description,
  used,
  quota,
  format,
  unit,
  ariaLabel,
  periodStart,
  periodEnd,
  footnote,
}: Props) {
  const percent = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const remaining = Math.max(0, quota - used);
  const unitSuffix = unit != null ? ` ${unit}` : '';

  return (
    <section className="rounded-lg border border-border p-6">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <span className="text-sm text-muted-foreground">{monthFormatter.format(periodStart)}</span>
      </div>
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">{description}</p>

      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-2xl font-semibold text-foreground">
          {format(used)}
          <span className="text-base font-normal text-muted-foreground">
            {' '}
            / {format(quota)}
            {unitSuffix}
          </span>
        </span>
        <span className="text-sm text-muted-foreground">
          {format(remaining)}
          {unitSuffix} left
        </span>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={quota}
        aria-label={ariaLabel}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Resets {resetFormatter.format(periodEnd)}
        {footnote != null ? ` · ${footnote}` : null}
      </p>
    </section>
  );
}
