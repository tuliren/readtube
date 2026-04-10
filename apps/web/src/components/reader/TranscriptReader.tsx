'use client';

import { useEffect, useState } from 'react';

import type { TranscriptSegment } from '@/lib/subtitles/types';
import { formatTimestamp, groupTranscriptSegments } from '@/lib/youtube/transcript';

interface Props {
  videoDbId: string;
  sourceId: string;
  onFetched?: () => void;
}

type Status = 'checking' | 'notCached' | 'fetching' | 'loaded' | 'error';

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

export default function TranscriptReader({ videoDbId, sourceId, onFetched }: Props) {
  const [segments, setSegments] = useState<TranscriptSegment[] | null>(null);
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    setStatus('checking');
    setSegments(null);

    fetch(`/api/videos/${videoDbId}/transcript`)
      .then(async (res) => {
        if (res.status === 404) {
          setStatus('notCached');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          return;
        }
        const data = (await res.json()) as { segments: TranscriptSegment[] };
        setSegments(data.segments);
        setStatus('loaded');
      })
      .catch(() => setStatus('error'));
  }, [videoDbId]);

  async function handleFetch() {
    setStatus('fetching');
    try {
      const res = await fetch(`/api/videos/${videoDbId}/transcript`, { method: 'POST' });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      const data = (await res.json()) as { segments: TranscriptSegment[] };
      setSegments(data.segments);
      setStatus('loaded');
      onFetched?.();
    } catch {
      setStatus('error');
    }
  }

  if (status === 'checking') {
    return <TranscriptSkeleton />;
  }

  if (status === 'notCached') {
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

  if (status === 'fetching') {
    return <TranscriptSkeleton />;
  }

  if (status === 'error') {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
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
    return (
      <div className="py-8 text-center text-sm text-gray-400">
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
              className="w-10 shrink-0 pt-1 font-mono text-xs text-gray-300 hover:text-blue-400"
              title={`Watch at ${formatTimestamp(para.startMs)}`}
            >
              {formatTimestamp(para.startMs)}
            </a>
            <p
              className="leading-relaxed text-gray-800"
              style={{ fontFamily: 'Georgia, serif', fontSize: '17px', lineHeight: '1.8' }}
            >
              {para.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
