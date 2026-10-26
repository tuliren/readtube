'use client';

import { TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS } from '@/constants';
import type { GenerationSubject } from '@/lib/reader/generationProgress';
import { useTranscriptGeneration } from '@/lib/reader/useTranscriptGeneration';

import GenerationProgressBox from './GenerationProgressBox';

const MAX_HOURS = TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS / 3600;

interface Props {
  videoDbId: string;
  subject: GenerationSubject;
  /** A transcript now exists; the reader resumes its generation. */
  onReady: () => void;
  /** The user declined; the reader returns to its Generate button. */
  onCancel: () => void;
}

/**
 * Shown in place of the progress box when a Generate click finds the
 * video has no captions. Asks whether to transcribe it with AI (each
 * run has real model cost, so it's never automatic), then tracks the
 * transcription in the same progress box until the transcript lands
 * and `onReady` hands control back to the reader.
 */
export default function TranscriptFallbackStep({ videoDbId, subject, onReady, onCancel }: Props) {
  const { status, starting, start } = useTranscriptGeneration(videoDbId, onReady);

  if (status.kind === 'checking') {
    return <GenerationProgressBox stage={{ kind: 'transcript' }} subject={subject} />;
  }

  if (status.kind === 'generating') {
    return <GenerationProgressBox stage={{ kind: 'transcribing' }} subject={subject} />;
  }

  const secondaryButton = (label: string) => (
    <button
      onClick={onCancel}
      className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
    >
      {label}
    </button>
  );

  if (status.kind === 'ineligible') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-500/30 dark:bg-amber-500/10">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          This video has no captions
        </p>
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">{status.message}</p>
        <div className="mt-4">{secondaryButton('OK')}</div>
      </div>
    );
  }

  // idle and failed share the layout: explanation + the choice.
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-500/30 dark:bg-amber-500/10">
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
        This video has no captions
      </p>
      {status.kind === 'failed' ? (
        <p className="mt-1 text-sm text-red-700 dark:text-red-300">{status.message}</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            The {subject} is written from the transcript, so the video needs to be transcribed with
            AI first. Transcription runs in the background and can take several minutes for long
            videos.
          </p>
          {status.exceedsLengthCap === true && (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              This video is longer than {MAX_HOURS} hours, so only the first {MAX_HOURS} hours will
              be transcribed.
            </p>
          )}
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={start}
          disabled={starting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {starting ? 'Starting…' : status.kind === 'failed' ? 'Try again' : 'Transcribe with AI'}
        </button>
        {secondaryButton('Not now')}
      </div>
    </div>
  );
}
