'use client';

import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import type { VideoData } from '@/lib/types';

import TranscriptReader from './TranscriptReader';

interface Props {
  video: VideoData;
}

function relativeDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function VideoReader({ video }: Props) {
  const searchParams = useSearchParams();
  const channelParam = searchParams.get('channel');
  const backHref = channelParam ? `/inbox?channel=${channelParam}` : '/inbox';
  const watchUrl = `https://youtube.com/watch?v=${video.sourceId}`;

  return (
    <div className="flex flex-col overflow-y-auto">
      {/* Back nav */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-6 py-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </Link>
      </div>

      {/* Article */}
      <article className="mx-auto w-full max-w-2xl px-6 py-8">
        {/* Meta: video title */}
        <h1 className="text-2xl font-bold leading-tight text-gray-900">{video.title}</h1>

        {/* Meta line */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-400">
          <span>{video.channelName}</span>
          <span>·</span>
          <span>{relativeDate(video.publishedAt)}</span>
          <span>·</span>
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            Watch on YouTube ↗
          </a>
        </div>

        {/* RSS description as quick summary */}
        {video.description && (
          <blockquote className="mt-5 border-l-2 border-gray-200 pl-4 text-sm leading-relaxed text-gray-500 italic">
            {video.description}
          </blockquote>
        )}

        {/* Transcript */}
        <div className="mt-8">
          <TranscriptReader videoDbId={video.id} sourceId={video.sourceId} />
        </div>
      </article>
    </div>
  );
}
