import LifetimeUsage from '@/components/usage/LifetimeUsage';
import UsageMeter from '@/components/usage/UsageMeter';
import type { GenerationUsage, LifetimeUsage as LifetimeUsageData } from '@/lib/usage/quota';

export interface UsageOverviewProps {
  usage: GenerationUsage;
  lifetime: LifetimeUsageData;
}

const formatCount = (value: number): string => value.toLocaleString('en-US');

/** Minutes shown as hours, to at most one decimal place. */
const formatMinutesAsHours = (minutes: number): string =>
  (minutes / 60).toLocaleString('en-US', { maximumFractionDigits: 1 });

/**
 * Presentational body of the /usage page. Kept free of auth and data
 * fetching so Storybook can render the whole page from fixtures.
 */
export default function UsageOverview({ usage, lifetime }: UsageOverviewProps) {
  const { captions, generated, periodStart, periodEnd } = usage;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">Usage</h1>
      <div className="space-y-6">
        <UsageMeter
          title="YouTube transcripts"
          description="Fetching a video’s YouTube captions counts toward this quota. Summaries and articles built from a transcript you already have don’t."
          used={captions.used}
          quota={captions.quota}
          format={formatCount}
          ariaLabel="Monthly YouTube transcripts used"
          periodStart={periodStart}
          periodEnd={periodEnd}
        />
        <UsageMeter
          title="Gemini transcripts"
          description="When a video has no captions, Gemini transcribes it from the video itself. This quota is metered by video length, and failed attempts don’t count."
          used={generated.minutes}
          quota={generated.quotaMinutes}
          format={formatMinutesAsHours}
          unit="hours"
          ariaLabel="Monthly Gemini transcription minutes used"
          periodStart={periodStart}
          periodEnd={periodEnd}
          footnote={`${formatCount(generated.videos)} ${generated.videos === 1 ? 'video' : 'videos'} this month`}
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
