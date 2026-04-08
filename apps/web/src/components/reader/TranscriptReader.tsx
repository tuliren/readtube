'use client';

import { useEffect, useState } from 'react';

import type { TranscriptSegment } from '@/lib/subtitles/types';
import { formatTimestamp, groupTranscriptSegments } from '@/lib/youtube/transcript';

interface Props {
  videoDbId: string;
  sourceId: string;
}

function TranscriptSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {[100, 80, 95, 70, 85, 90, 75].map((w, i) => (
        <div key={i} className="space-y-2">
          <div className={`h-4 rounded bg-gray-200`} style={{ width: `${w}%` }} />
          <div
            className={`h-4 rounded bg-gray-200`}
            style={{ width: `${Math.max(w - 20, 40)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export default function TranscriptReader({ videoDbId, sourceId }: Props) {
  const [segments, setSegments] = useState<TranscriptSegment[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setSegments(null);
    setError(false);

    fetch(`/api/videos/${videoDbId}/transcript`)
      .then(async (res) => {
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = (await res.json()) as { segments: TranscriptSegment[] };
        setSegments(data.segments);
      })
      .catch(() => setError(true));
  }, [videoDbId]);

  if (error) {
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

  if (segments === null) {
    return <TranscriptSkeleton />;
  }

  const paragraphs = groupTranscriptSegments(segments);

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
