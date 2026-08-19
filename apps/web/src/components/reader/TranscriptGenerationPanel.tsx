'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS } from '@/constants';

interface GenerationInfo {
  eligible: boolean;
  ineligibleReason: 'platform' | 'too-long' | 'duration-unknown' | null;
  state: 'idle' | 'generating' | 'failed';
  errorMessage: string | null;
}

interface Props {
  videoDbId: string;
  watchUrl: string;
  platformName: string;
  /** Called when a transcript exists (generation finished, or captions
   *  appeared) — the parent flips the shared transcript status to
   *  'present' and the normal tabbed reader takes over. */
  onTranscriptReady: () => void;
}

type PanelStatus =
  | { kind: 'checking' }
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'failed'; message: string }
  | { kind: 'ineligible'; message: string };

const POLL_INTERVAL_MS = 10_000;
const MAX_HOURS = TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS / 3600;

function ineligibleMessage(reason: GenerationInfo['ineligibleReason']): string {
  if (reason === 'platform') {
    return 'AI transcription is only supported for YouTube videos.';
  }
  if (reason === 'too-long') {
    return `AI transcription currently supports videos up to ${MAX_HOURS} hours.`;
  }
  return 'AI transcription is not available for this video because its duration is unknown.';
}

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
  const [status, setStatus] = useState<PanelStatus>({ kind: 'checking' });
  const [starting, setStarting] = useState(false);
  // onTranscriptReady flips parent state that unmounts this panel;
  // keep the latest callback in a ref so the polling effect doesn't
  // need it as a dependency (which would restart the interval on
  // every parent render).
  const onReadyRef = useRef(onTranscriptReady);
  onReadyRef.current = onTranscriptReady;

  const applyGetResponse = useCallback(async (res: Response): Promise<void> => {
    if (res.ok) {
      onReadyRef.current();
      return;
    }
    if (res.status === 410) {
      const body = (await res.json().catch(() => null)) as { generation?: GenerationInfo } | null;
      const generation = body?.generation;
      if (generation == null) {
        // Older response shape (or public route) — no generation
        // metadata to act on; offer the button and let POST guards
        // decide.
        setStatus({ kind: 'idle' });
        return;
      }
      if (!generation.eligible) {
        setStatus({ kind: 'ineligible', message: ineligibleMessage(generation.ineligibleReason) });
        return;
      }
      if (generation.state === 'generating') {
        setStatus({ kind: 'generating' });
        return;
      }
      if (generation.state === 'failed') {
        setStatus({
          kind: 'failed',
          message: generation.errorMessage ?? 'Transcript generation failed.',
        });
        return;
      }
      setStatus({ kind: 'idle' });
      return;
    }
    // 404 (not tried) or transient errors: the parent only renders
    // this panel when the sticky flag is known, so just offer the
    // button; the POST guards catch anything odd.
    setStatus({ kind: 'idle' });
  }, []);

  // Seed the panel from the server on mount / video change. A page
  // refresh mid-generation lands directly in the 'generating' state.
  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: 'checking' });
    fetch(`/api/videos/${videoDbId}/transcript`)
      .then((res) => {
        if (!cancelled) {
          return applyGetResponse(res);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ kind: 'idle' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [videoDbId, applyGetResponse]);

  // Poll while generating. The GET route doubles as progress endpoint:
  // 200 means the transcript row landed; a 410 whose generation.state
  // is 'failed' means the workflow reverted with an error.
  useEffect(() => {
    if (status.kind !== 'generating') {
      return;
    }
    const interval = setInterval(() => {
      fetch(`/api/videos/${videoDbId}/transcript`)
        .then((res) => applyGetResponse(res))
        .catch(() => {
          // Transient poll failure — keep polling.
        });
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(interval);
    };
  }, [status.kind, videoDbId, applyGetResponse]);

  async function handleGenerate() {
    setStarting(true);
    try {
      const res = await fetch(`/api/videos/${videoDbId}/transcript/generate`, { method: 'POST' });
      const body = (await res.json().catch(() => null)) as {
        status?: string;
        error?: string;
        code?: string;
      } | null;
      if (res.ok || res.status === 202) {
        if (body?.status === 'ready') {
          onReadyRef.current();
          return;
        }
        setStatus({ kind: 'generating' });
        return;
      }
      const message = body?.error ?? 'Could not start transcript generation.';
      if (res.status === 422) {
        setStatus({ kind: 'ineligible', message });
        return;
      }
      setStatus({ kind: 'failed', message });
    } catch {
      setStatus({ kind: 'failed', message: 'Could not start transcript generation.' });
    } finally {
      setStarting(false);
    }
  }

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
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
          ReadTube can transcribe it with AI instead. Generation runs in the background and can take
          several minutes for long videos.
        </p>
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
