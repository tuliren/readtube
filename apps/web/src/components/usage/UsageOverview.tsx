import LifetimeUsage from '@/components/usage/LifetimeUsage';
import UsageMeter from '@/components/usage/UsageMeter';
import type { GenerationUsage, LifetimeUsage as LifetimeUsageData } from '@/lib/usage/quota';

interface Props {
  usage: GenerationUsage;
  lifetime: LifetimeUsageData;
}

/**
 * Presentational body of the /usage page. Kept free of auth and data
 * fetching so Storybook can render the whole page from fixtures.
 */
export default function UsageOverview({ usage, lifetime }: Props) {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">Usage</h1>
      <div className="space-y-6">
        <UsageMeter
          used={usage.used}
          breakdown={usage.breakdown}
          quota={usage.quota}
          periodStart={usage.periodStart}
          periodEnd={usage.periodEnd}
        />
        <LifetimeUsage
          transcript={lifetime.transcript}
          summary={lifetime.summary}
          article={lifetime.article}
        />
      </div>
    </div>
  );
}
