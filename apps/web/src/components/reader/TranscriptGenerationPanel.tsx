'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS } from '@/constants';

interface GenerationInfo {
  eligible: boolean;
  ineligibleReason: 'platform' | null;
  state: 'idle' | 'generating' | 'failed';
  errorMessage: string | null;
  /** True when the video is longer than the AI transcription cap, so
   *  only the first MAX_HOURS hours would be transcribed. */
  exceedsLengthCap?: boolean;
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
  | { kind: 'idle'; exceedsLengthCap?: boolean }
  | { kind: 'generating' }
  | { kind: 'failed'; message: string }
  | { kind: 'ineligible'; message: string };

const POLL_INTERVAL_MS = 10_000;
const MAX_HOURS = TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS / 3600;

/**
 * While the panel believes a generation is in flight, tolerate this
 * many consecutive polls that claim "nothing here, not generating"
 * (or fail outright) before giving up and showing the button again.
 * A mid-run 'idle' is almost always a read-interleaving artifact or a
 * transient server error, and flipping on it would also stop the
 * polling loop, stranding a stale panel over a finished transcript.
 */
const MAX_UNEXPLAINED_POLLS = 3;

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
  // Mirror of `status` for applyGetResponse, which is deliberately
  // dependency-free (it seeds both the mount fetch and the polling
  // interval) but needs to know whether a generation is in flight to
  // apply the unexplained-poll tolerance below.
  const statusRef = useRef<PanelStatus>(status);
  statusRef.current = status;
  const unexplainedPollsRef = useRef(0);

  const applyGetResponse = useCallback(async (res: Response): Promise<void> => {
    if (res.ok) {
      // Poll mode: a 200 can arrive while the workflow is still
      // finishing — the transcript row is persisted but the marker is
      // held until the auto-summary handoff. Keep the spinner until
      // the marker is released, so when the tabbed reader takes over
      // the summary tab has a run to tap into instead of a stale
      // "no summary" state.
      const body = (await res.json().catch(() => null)) as {
        generation?: { state?: string };
      } | null;
      unexplainedPollsRef.current = 0;
      if (body?.generation?.state === 'generating') {
        setStatus({ kind: 'generating' });
        return;
      }
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
        setStatus({
          kind: 'ineligible',
          message: 'AI transcription is only supported for YouTube videos.',
        });
        return;
      }
      if (generation.state === 'generating') {
        unexplainedPollsRef.current = 0;
        setStatus({ kind: 'generating' });
        return;
      }
      if (generation.state === 'failed') {
        unexplainedPollsRef.current = 0;
        setStatus({
          kind: 'failed',
          message: generation.errorMessage ?? 'Transcript generation failed.',
        });
        return;
      }
      // State 'idle' while we believe a run is in flight is a race
      // artifact (see the server's re-check) or a run that vanished
      // without a marker. Keep the spinner for a few polls — flipping
      // to 'idle' would also stop the polling loop.
      if (
        statusRef.current.kind === 'generating' &&
        unexplainedPollsRef.current < MAX_UNEXPLAINED_POLLS
      ) {
        unexplainedPollsRef.current += 1;
        return;
      }
      unexplainedPollsRef.current = 0;
      setStatus({ kind: 'idle', exceedsLengthCap: generation.exceedsLengthCap === true });
      return;
    }
    // 404 (not tried) or transient errors: the parent only renders
    // this panel when the sticky flag is known, so just offer the
    // button; the POST guards catch anything odd. Mid-generation,
    // apply the same tolerance as the 'idle' case so a server blip
    // doesn't strand a stale panel over a finishing run.
    if (
      statusRef.current.kind === 'generating' &&
      unexplainedPollsRef.current < MAX_UNEXPLAINED_POLLS
    ) {
      unexplainedPollsRef.current += 1;
      return;
    }
    unexplainedPollsRef.current = 0;
    setStatus({ kind: 'idle' });
  }, []);

  // Seed the panel from the server on mount / video change. A page
  // refresh mid-generation lands directly in the 'generating' state.
  // `poll=1` asks for generation state alongside a cached transcript,
  // so a refresh during the summary handoff keeps the spinner instead
  // of flashing an intermediate state.
  useEffect(() => {
    let cancelled = false;
    unexplainedPollsRef.current = 0;
    setStatus({ kind: 'checking' });
    fetch(`/api/videos/${videoDbId}/transcript?poll=1`)
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
  // a 200 whose generation.state is no longer 'generating' means the
  // transcript landed AND the auto-summary handoff finished; a 410
  // whose generation.state is 'failed' means the workflow reverted
  // with an error.
  //
  // Browsers throttle interval timers in background tabs (Chrome: to
  // ~once a minute, more aggressively after prolonged inactivity), so
  // a user who switches away during generation can come back to a
  // spinner whose decisive poll hasn't fired yet. The visibilitychange
  // listener fires a poll the moment the tab is foregrounded again, so
  // the panel flips immediately instead of waiting out the throttled
  // interval.
  useEffect(() => {
    if (status.kind !== 'generating') {
      return;
    }
    const poll = () => {
      fetch(`/api/videos/${videoDbId}/transcript?poll=1`)
        .then((res) => applyGetResponse(res))
        .catch(() => {
          // Transient poll failure — keep polling.
        });
    };
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        poll();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
        unexplainedPollsRef.current = 0;
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
