'use client';

import { Loader2 } from 'lucide-react';

import { TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS } from '@/constants';
import { useTranscriptGeneration } from '@/lib/reader/useTranscriptGeneration';

interface Props {
  videoDbId: string;
  watchUrl: string;
  platformName: string;
  /** Called when a transcript exists (generation finished, or captions
   *  appeared) — the parent flips the shared transcript status to
   *  'present' and the normal tabbed reader takes over. */
  onTranscriptReady: () => void;
}

const MAX_HOURS = TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS / 3600;

/**
 * Replaces the old dead-end "no transcript" notice for caption-less
 * videos. Offers an explicit, user-triggered AI generation (never
 * automatic — each run has real model cost), shows in-flight progress
 * by polling the transcript GET route, and surfaces failures with a
 * retry. Only rendered in authenticated mode — public share pages
 * keep a static notice since visitors cannot trigger paid work.
 */
export default function TranscriptGenerationPanel({
  videoDbId,
  watchUrl,
  platformName,
  onTranscriptReady,
}: Props) {
  const {
    status,
    starting,
    start: handleGenerate,
  } = useTranscriptGeneration(videoDbId, onTranscriptReady);

  const watchLink = (
    <a
      href={watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
    >
      Watch on {platformName} ↗
    </a>
  );

  if (status.kind === 'checking') {
    return (
      <div className="mt-8 flex items-center justify-center gap-2 rounded-md border border-border px-4 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking transcript status…
      </div>
    );
  }

  if (status.kind === 'generating') {
    return (
      <div className="mt-8 rounded-md border border-blue-200 bg-blue-50 px-4 py-6 text-center dark:border-blue-500/30 dark:bg-blue-500/10">
        <p className="inline-flex items-center gap-2 text-base font-medium text-blue-800 dark:text-blue-200">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating transcript with AI
        </p>
        <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
          This can take several minutes for long videos. You can leave this page; generation
          continues in the background.
        </p>
        {watchLink}
      </div>
    );
  }

  if (status.kind === 'ineligible') {
    return (
      <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-6 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
        <p className="text-base font-medium text-amber-800 dark:text-amber-200">
          No transcript is available for this video
        </p>
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{status.message}</p>
        {watchLink}
      </div>
    );
  }

  // idle and failed share the layout: explanation + Generate button.
  return (
    <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-6 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
      <p className="text-base font-medium text-amber-800 dark:text-amber-200">
        {platformName} provides no captions for this video
      </p>
      {status.kind === 'failed' ? (
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">{status.message}</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
            ReadTube can transcribe it with AI instead. Generation runs in the background and can
            take several minutes for long videos.
          </p>
          {status.exceedsLengthCap === true && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              This video is longer than {MAX_HOURS} hours, so only the first {MAX_HOURS} hours will
              be transcribed.
            </p>
          )}
        </>
      )}
      <div className="mt-4">
        <button
          onClick={handleGenerate}
          disabled={starting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {starting ? 'Starting…' : status.kind === 'failed' ? 'Try again' : 'Generate transcript'}
        </button>
      </div>
      {watchLink}
    </div>
  );
}
