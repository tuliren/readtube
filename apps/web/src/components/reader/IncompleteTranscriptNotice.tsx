'use client';

import { TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS } from '@/constants';
import { formatTimestamp } from '@/lib/platforms/youtube/transcript';
import type { TranscriptGap } from '@/lib/transcripts/transcriptGaps';
import type { VideoPlatform } from '@/lib/types';
import { buildWatchLink } from '@/lib/urls/watchUrl';

const MAX_HOURS = TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS / 3600;

interface Props {
  /** Uncovered stretches of the video, in seconds of original time. */
  gaps: TranscriptGap[];
  platform: VideoPlatform;
  sourceId: string;
  /** Full video length; null when unknown. A length over the
   *  generation cap means the tail gap is by design, so the notice
   *  explains the cap rather than leaving the omission unexplained. */
  durationSeconds: number | null;
}

/**
 * Shown under every reader tab when the AI transcript left part of the
 * video uncovered (a content-policy block skips a window; an output
 * truncation drops the tail; a video longer than the generation cap is
 * transcribed only up to the cap). The summary and article are
 * generated from this same transcript, so those tabs share the
 * omission — hence one notice under all three. Each gap deep-links
 * into the source video so the reader can watch the missing part.
 */
export default function IncompleteTranscriptNotice({
  gaps,
  platform,
  sourceId,
  durationSeconds,
}: Props) {
  if (gaps.length === 0) {
    return null;
  }
  // Gaps are only reported for AI-generated transcripts, so an
  // over-cap duration here means generation stopped at the cap.
  const lengthCapped =
    durationSeconds != null && durationSeconds > TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS;
  const { platformName } = buildWatchLink(platform, sourceId);
  return (
    <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
      <p className="font-medium text-amber-800 dark:text-amber-200">
        This transcript is incomplete
      </p>
      <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">
        AI transcription could not cover {gaps.length === 1 ? 'one part' : 'some parts'} of this
        video, usually because a section triggered the model&apos;s content policy or the output was
        cut short. The transcript, summary, and article all skip{' '}
        {gaps.length === 1 ? 'that part' : 'those parts'}. Watch the original for what is missing:
      </p>
      <ul className="mt-2 space-y-1">
        {gaps.map((gap) => {
          const { url } = buildWatchLink(platform, sourceId, gap.startSec);
          return (
            <li key={`${gap.startSec}-${gap.endSec}`}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-amber-900 hover:underline dark:text-amber-100"
              >
                {formatTimestamp(gap.startSec * 1000)}
                {'–'}
                {formatTimestamp(gap.endSec * 1000)}
              </a>{' '}
              <span className="text-amber-800/80 dark:text-amber-200/80">on {platformName} ↗</span>
            </li>
          );
        })}
      </ul>
      {lengthCapped && (
        <p className="mt-2 text-amber-800/90 dark:text-amber-200/90">
          This video is longer than the {MAX_HOURS}-hour AI transcription limit, so everything after
          the {MAX_HOURS}-hour mark is not transcribed.
        </p>
      )}
    </div>
  );
}
