'use client';

import { useEffect, useState } from 'react';

import type { TranscriptSegment } from '@/lib/subtitles/types';
import { formatTimestamp, groupTranscriptSegments } from '@/lib/youtube/transcript';

import type { TranscriptStatus } from './VideoReader';

interface Props {
  videoDbId: string;
  sourceId: string;
  /** Shared availability state lifted to VideoReader so the three
   *  reader tabs agree on whether the transcript exists, is missing,
   *  or hasn't been checked yet. */
  transcriptStatus: TranscriptStatus;
  /** Callback into VideoReader so this component can flip the shared
   *  status when its own GET / POST reveals the answer. */
  onTranscriptStatusChange: (next: TranscriptStatus) => void;
}

type LocalStatus = 'checking' | 'notCached' | 'fetching' | 'loaded' | 'error';

function TranscriptSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {[100, 80, 95, 70, 85, 90, 75].map((w, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 rounded bg-gray-200" style={{ width: `${w}%` }} />
          <div className="h-4 rounded bg-gray-200" style={{ width: `${Math.max(w - 20, 40)}%` }} />
        </div>
      ))}
    </div>
  );
}

function UnavailableMessage({ sourceId }: { sourceId: string }) {
  return (
    <div className="py-8 text-center text-sm text-gray-500">
      No transcript is available for this video.{' '}
      <a
        href={`https://youtube.com/watch?v=${sourceId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline"
      >
        Watch on YouTube ↗
      </a>
    </div>
  );
}

export default function TranscriptReader({
  videoDbId,
  sourceId,
  transcriptStatus,
  onTranscriptStatusChange,
}: Props) {
  const [segments, setSegments] = useState<TranscriptSegment[] | null>(null);
  const [localStatus, setLocalStatus] = useState<LocalStatus>('checking');

  useEffect(() => {
    // If the parent already knows the transcript is unavailable
    // (server flag from SSR or set by another tab earlier this
    // session), skip the GET entirely. Both halves of the user's
    // request — auto-fetch on Generate AND remember failed fetches —
    // benefit from this short circuit.
    if (transcriptStatus === 'unavailable') {
      setLocalStatus('notCached');
      setSegments(null);
      return;
    }

    setLocalStatus('checking');
    setSegments(null);

    fetch(`/api/videos/${videoDbId}/transcript`)
      .then(async (res) => {
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
        onTranscriptStatusChange('present');
      })
      .catch(() => setLocalStatus('error'));
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
      onTranscriptStatusChange('present');
    } catch {
      setLocalStatus('error');
    }
  }

  // Sticky-unavailable shortcut, regardless of localStatus.
  if (transcriptStatus === 'unavailable') {
    return <UnavailableMessage sourceId={sourceId} />;
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
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        Transcript unavailable.{' '}
        <a
          href={`https://youtube.com/watch?v=${sourceId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          Watch on YouTube ↗
        </a>
      </div>
    );
  }

  const paragraphs = segments ? groupTranscriptSegments(segments) : [];

  if (paragraphs.length === 0) {
    return <UnavailableMessage sourceId={sourceId} />;
  }

  return (
    <div className="space-y-5">
      {paragraphs.map((para, i) => {
        const startSeconds = Math.floor(para.startMs / 1000);
        const youtubeUrl = `https://youtube.com/watch?v=${sourceId}&t=${startSeconds}`;

        return (
          <div key={i} className="flex gap-4">
            <a
              href={youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 shrink-0 pt-1 font-mono text-xs text-gray-400 hover:text-blue-400"
              title={`Watch at ${formatTimestamp(para.startMs)}`}
            >
              {formatTimestamp(para.startMs)}
            </a>
            <p className="font-sans text-[17px] leading-[1.8] text-gray-800">{para.text}</p>
          </div>
        );
      })}
    </div>
  );
}
