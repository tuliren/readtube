interface Props {
  /** Transcript generations spent in the current month. */
  used: number;
  /** Monthly allotment. */
  quota: number;
  /** First instant of the current month (UTC). */
  periodStart: Date;
  /** First instant of next month (UTC) — the reset point. */
  periodEnd: Date;
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
 * Read-only meter for the user's monthly transcript-generation usage.
 * Purely informational — no warning styling or limit enforcement yet
 * (see T-483). The fill is clamped to 100% so an over-quota month (once
 * limits aren't enforced) still renders a sane bar.
 */
export default function UsageMeter({ used, quota, periodStart, periodEnd }: Props) {
  const percent = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const remaining = Math.max(0, quota - used);

  return (
    <section className="rounded-lg border border-border p-6">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium text-foreground">Transcript generations</h2>
        <span className="text-sm text-muted-foreground">{monthFormatter.format(periodStart)}</span>
      </div>
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">
        Generating a transcript for a new video counts toward your monthly quota. Summaries and
        articles built from a transcript you already generated don&rsquo;t.
      </p>

      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-2xl font-semibold text-foreground">
          {used.toLocaleString()}
          <span className="text-base font-normal text-muted-foreground">
            {' '}
            / {quota.toLocaleString()}
          </span>
        </span>
        <span className="text-sm text-muted-foreground">{remaining.toLocaleString()} left</span>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={quota}
        aria-label="Monthly transcript generations used"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Resets {resetFormatter.format(periodEnd)}
      </p>
    </section>
  );
}
