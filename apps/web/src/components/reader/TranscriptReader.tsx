'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { countWords } from '@/lib/format/wordCount';
import type { TranscriptSegment } from '@/lib/platforms/types';
import { formatTimestamp, groupTranscriptSegments } from '@/lib/platforms/youtube/transcript';
import { buildTranscriptToc, transcriptParagraphId } from '@/lib/reader/buildTranscriptToc';
import type { VideoPlatform } from '@/lib/types';
import { buildWatchLink } from '@/lib/urls/watchUrl';

import FloatingToc from './FloatingToc';
import type { TranscriptStatus } from './VideoReader';

interface Props {
  videoDbId: string;
  sourceId: string;
  /** Owning platform — used to build the correct external "Watch on X"
   *  link for the video, including the timestamped deep-links per
   *  transcript paragraph. */
  platform: VideoPlatform;
  /** Shared availability state lifted to VideoReader so the three
   *  reader tabs agree on whether the transcript exists, is missing,
   *  or hasn't been checked yet. */
  transcriptStatus: TranscriptStatus;
  /** Callback into VideoReader so this component can flip the shared
   *  status when its own GET / POST reveals the answer. */
  onTranscriptStatusChange: (next: TranscriptStatus) => void;
  /** Reports the transcript word count up to VideoReader so the
   *  Transcript tab header can render the reading time badge. Fires
   *  whenever the segment list changes (initial load, fetch, etc.). */
  onTranscriptWordsChange: (words: number) => void;
}

type LocalStatus = 'checking' | 'notCached' | 'fetching' | 'loaded' | 'error';

function TranscriptSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {[100, 80, 95, 70, 85, 90, 75].map((w, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 rounded bg-muted" style={{ width: `${w}%` }} />
          <div className="h-4 rounded bg-muted" style={{ width: `${Math.max(w - 20, 40)}%` }} />
        </div>
      ))}
    </div>
  );
}

function UnavailableMessage({ platform, sourceId }: { platform: VideoPlatform; sourceId: string }) {
  const { url, platformName } = buildWatchLink(platform, sourceId);
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      No transcript is available for this video.{' '}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline"
      >
        Watch on {platformName} ↗
      </a>
    </div>
  );
}

export default function TranscriptReader({
  videoDbId,
  sourceId,
  platform,
  transcriptStatus,
  onTranscriptStatusChange,
  onTranscriptWordsChange,
}: Props) {
  const [segments, setSegments] = useState<TranscriptSegment[] | null>(null);
  const [localStatus, setLocalStatus] = useState<LocalStatus>('checking');

  // Stream the transcript word count up to VideoReader so the
  // Transcript tab header can render the reading-time badge.
  useEffect(() => {
    if (segments == null) {
      onTranscriptWordsChange(0);
      return;
    }
    onTranscriptWordsChange(countWords(segments.map((s) => s.text).join(' ')));
  }, [segments, onTranscriptWordsChange]);

  // Track which videoDbId we already have segments for. The effect
  // depends on transcriptStatus so an external flip from the Summary
  // or Article tab (e.g., they ran ensureTranscript on the user's
  // first Generate click and broadcast 'present') re-runs the effect
  // automatically. Without this ref, it would also re-run after our
  // OWN successful initial fetch — broadcasting + a re-fetch +
  // localStatus flickering loaded → checking → loaded. The ref lets
  // the effect bail out on subsequent runs once we've loaded data
  // for this video, while still allowing a fresh fetch when the
  // status flips from notCached to present.
  const loadedForVideoDbIdRef = useRef<string | null>(null);

  useEffect(() => {
    // If the parent already knows the transcript is unavailable
    // (server flag from SSR or set by another tab earlier this
    // session), skip the GET entirely. Both halves of the user's
    // request — auto-fetch on Generate AND remember failed fetches —
    // benefit from this short circuit.
    if (transcriptStatus === 'unavailable') {
      setLocalStatus('notCached');
      setSegments(null);
      loadedForVideoDbIdRef.current = null;
      return;
    }

    // Already have segments for this video — nothing to do. This is
    // the path that handles the external 'present' broadcast from
    // Summary/Article AFTER our initial GET already loaded the data
    // (the cached-transcript happy path). Without this guard the
    // user would see the transcript pane briefly flicker through
    // the skeleton on every successful Summary/Article generate.
    if (loadedForVideoDbIdRef.current === videoDbId) {
      return;
    }

    let cancelled = false;
    setLocalStatus('checking');
    setSegments(null);

    fetch(`/api/videos/${videoDbId}/transcript`)
      .then(async (res) => {
        if (cancelled) {
          return;
        }
        // 410 Gone is the canonical "we already tried and there's
        // nothing here" signal — flip the shared status so Summary
        // and Article also surface the unavailable state without
        // doing their own probe.
        if (res.status === 410) {
          onTranscriptStatusChange('unavailable');
          setLocalStatus('notCached');
          return;
        }
        if (res.status === 404) {
          // Genuine cache miss — leave the status alone so the user
          // can click Fetch (or kick off a Summary/Article generate
          // that will auto-fetch via ensureTranscript). Don't
          // broadcast 'present' here — we don't have the data yet.
          setLocalStatus('notCached');
          return;
        }
        if (!res.ok) {
          setLocalStatus('error');
          return;
        }
        const data = (await res.json()) as { segments: TranscriptSegment[] };
        setSegments(data.segments);
        setLocalStatus('loaded');
        // Set the ref BEFORE the broadcast so when the effect re-runs
        // (because transcriptStatus prop changes from unknown→present)
        // it sees the loaded ref and bails out without re-fetching.
        // The combination of (loadedForVideoDbIdRef guard) +
        // (broadcast 'present' here) is what lets the parent's tab
        // dot for Transcript flip to blue on a cache hit without
        // double-fetching.
        loadedForVideoDbIdRef.current = videoDbId;
        onTranscriptStatusChange('present');
      })
      .catch(() => {
        if (!cancelled) {
          setLocalStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [videoDbId, transcriptStatus, onTranscriptStatusChange]);

  async function handleFetch() {
    setLocalStatus('fetching');
    try {
      const res = await fetch(`/api/videos/${videoDbId}/transcript`, { method: 'POST' });
      if (res.status === 410) {
        onTranscriptStatusChange('unavailable');
        setLocalStatus('notCached');
        return;
      }
      if (!res.ok) {
        setLocalStatus('error');
        return;
      }
      const data = (await res.json()) as { segments: TranscriptSegment[] };
      setSegments(data.segments);
      setLocalStatus('loaded');
      // Set the ref BEFORE the broadcast so when the effect re-runs
      // (because transcriptStatus prop changes from unknown→present)
      // it sees the loaded ref and bails out.
      loadedForVideoDbIdRef.current = videoDbId;
      onTranscriptStatusChange('present');
    } catch {
      setLocalStatus('error');
    }
  }

  // Sticky-unavailable shortcut, regardless of localStatus.
  if (transcriptStatus === 'unavailable') {
    return <UnavailableMessage platform={platform} sourceId={sourceId} />;
  }

  if (localStatus === 'checking') {
    return <TranscriptSkeleton />;
  }

  if (localStatus === 'notCached') {
    return (
      <div className="py-8 text-center">
        <button
          onClick={handleFetch}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Fetch transcript
        </button>
      </div>
    );
  }

  if (localStatus === 'fetching') {
    return <TranscriptSkeleton />;
  }

  if (localStatus === 'error') {
    // Reaches here for transient failures (503 from the server,
    // network errors caught locally, etc.). Distinct from the
    // sticky `transcriptStatus === 'unavailable'` branch above:
    // permanent unavailability is handled there, with no retry.
    // Here the next click is likely to succeed, so offer one.
    const { url: watchUrl, platformName } = buildWatchLink(platform, sourceId);
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted-foreground">
        <p>Could not fetch the transcript right now.</p>
        <button
          onClick={handleFetch}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Try again
        </button>
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline"
        >
          Watch on {platformName} ↗
        </a>
      </div>
    );
  }

  return <TranscriptContent segments={segments} platform={platform} sourceId={sourceId} />;
}

function TranscriptContent({
  segments,
  platform,
  sourceId,
}: {
  segments: TranscriptSegment[] | null;
  platform: VideoPlatform;
  sourceId: string;
}) {
  const paragraphs = useMemo(() => (segments ? groupTranscriptSegments(segments) : []), [segments]);
  const tocItems = useMemo(() => buildTranscriptToc(paragraphs), [paragraphs]);

  if (paragraphs.length === 0) {
    return <UnavailableMessage platform={platform} sourceId={sourceId} />;
  }

  return (
    <div className="space-y-5">
      {paragraphs.map((para, i) => {
        const startSeconds = Math.floor(para.startMs / 1000);
        const { url: paragraphUrl } = buildWatchLink(platform, sourceId, startSeconds);

        return (
          <div key={i} id={transcriptParagraphId(i)} className="flex scroll-mt-20 gap-4">
            <a
              href={paragraphUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 shrink-0 pt-1 font-mono text-xs text-muted-foreground hover:text-blue-400"
              title={`Watch at ${formatTimestamp(para.startMs)}`}
            >
              {formatTimestamp(para.startMs)}
            </a>
            <p className="font-sans text-[17px] leading-[1.8] text-foreground">{para.text}</p>
          </div>
        );
      })}
      <FloatingToc items={tocItems} variant="timestamps" />
    </div>
  );
}
