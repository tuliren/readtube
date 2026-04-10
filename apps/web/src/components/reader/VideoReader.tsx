'use client';

import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import type { VideoData } from '@/lib/types';

import TranscriptReader from './TranscriptReader';

interface Props {
  video: VideoData;
}

type Tab = 'transcript' | 'article';

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

  const [activeTab, setActiveTab] = useState<Tab>('transcript');

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* Back nav */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-6 py-3">
        <div className="mx-auto w-full max-w-2xl">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </Link>
        </div>
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

        {/* Tabs */}
        <div className="mt-8 border-b border-gray-200">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('transcript')}
              className={`-mb-px border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'transcript'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Transcript
            </button>
            <button
              onClick={() => setActiveTab('article')}
              className={`-mb-px border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'article'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Article
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div className="mt-6">
          <div className={activeTab === 'transcript' ? '' : 'hidden'}>
            <TranscriptReader
              videoDbId={video.id}
              sourceId={video.sourceId}
              onFetched={() => setActiveTab('transcript')}
            />
          </div>
          <div className={activeTab === 'article' ? '' : 'hidden'}>
            <div className="py-8 text-center text-sm text-gray-400">Article not yet generated.</div>
          </div>
        </div>
      </article>
    </div>
  );
}
