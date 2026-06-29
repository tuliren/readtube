interface Props {
  /** Total transcript generations ever. */
  transcript: number;
  /** Total summary generations ever. */
  summary: number;
  /** Total article generations ever. */
  article: number;
}

/**
 * All-time generation totals, broken down by type. Read-only — no
 * quota or limit applies to the lifetime figure; it's context next to
 * the monthly meter (see T-483).
 */
export default function LifetimeUsage({ transcript, summary, article }: Props) {
  const items = [
    { label: 'Transcripts', value: transcript },
    { label: 'Summaries', value: summary },
    { label: 'Articles', value: article },
  ];

  return (
    <section className="rounded-lg border border-border p-6">
      <h2 className="mb-1 text-sm font-medium text-foreground">Lifetime usage</h2>
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">
        Everything you&rsquo;ve generated since you joined.
      </p>
      <dl className="grid grid-cols-3 gap-4">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-sm text-muted-foreground">{item.label}</dt>
            <dd className="mt-1 text-2xl font-semibold text-foreground">
              {item.value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
