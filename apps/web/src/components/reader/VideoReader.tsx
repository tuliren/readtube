'use client';

import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { formatDurationSeconds } from '@/lib/format/duration';
import type { VideoData } from '@/lib/types';

import ArticleReader from './ArticleReader';
import SummaryReader from './SummaryReader';
import TranscriptReader from './TranscriptReader';
import VideoReaderActions from './VideoReaderActions';

interface Props {
  video: VideoData;
}

type Tab = 'summary' | 'article' | 'transcript';
export type TranscriptStatus = 'unknown' | 'present' | 'unavailable';
const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'article', label: 'Article' },
  { key: 'transcript', label: 'Transcript' },
];

function relativeDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function VideoReader({ video }: Props) {
  const searchParams = useSearchParams();
  const channelParam = searchParams.get('channelId');
  const backHref = channelParam ? `/inbox?channelId=${channelParam}` : '/inbox';
  const watchUrl = `https://youtube.com/watch?v=${video.sourceId}`;

  // Default to Summary because that's the cheapest scannable view —
  // the previous default of Transcript meant every reader open
  // landed on the densest, longest content first.
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const durationLabel = formatDurationSeconds(video.durationSeconds);

  // Shared transcript availability state across all three tabs.
  // Seeded from the SSR-rendered VideoData so a video that was already
  // marked transcript_unavailable in a previous session opens straight
  // into the unavailable state without retrying. The three children
  // call setTranscriptStatus when their own requests reveal the
  // status: TranscriptReader's GET, and either auto-fetch (Summary /
  // Article generate buttons) running through ensureTranscript on
  // the server.
  const [transcriptStatus, setTranscriptStatus] = useState<TranscriptStatus>(
    video.transcriptUnavailable ? 'unavailable' : 'unknown'
  );

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/*
        Back nav + triage actions. The header bar deliberately bypasses
        the article's `mx-auto max-w-3xl` indent and uses px-3 directly,
        matching the Channels-section header on the sidebar — both
        category headers should hug the pane edge with the same
        12px-from-the-edge action rail. Without this the Back link and
        the action buttons sat indented to match the article body and
        floated in a sea of whitespace.
      */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-3 py-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 px-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </Link>
        <VideoReaderActions video={video} />
      </div>

      {/* Article */}
      <article className="mx-auto w-full max-w-3xl px-6 py-8">
        {/* Meta: video title */}
        <h1 className="text-2xl font-bold leading-tight text-gray-900">{video.title}</h1>

        {/* Meta line */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-400">
          <span>{video.channelName}</span>
          <span>·</span>
          <span>{relativeDate(video.publishedAt)}</span>
          {durationLabel != null && (
            <>
              <span>·</span>
              <span>{durationLabel}</span>
            </>
          )}
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

        {/* Tabs — Summary first because it's the cheapest scannable
            view, then Article (the long-form rewrite), then Transcript
            (the raw firehose). */}
        <div className="mt-8 border-b border-gray-200">
          <div className="flex gap-6">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`-mb-px border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="mt-6">
          <div className={activeTab === 'summary' ? '' : 'hidden'}>
            <SummaryReader
              videoDbId={video.id}
              transcriptStatus={transcriptStatus}
              onTranscriptStatusChange={setTranscriptStatus}
            />
          </div>
          <div className={activeTab === 'article' ? '' : 'hidden'}>
            <ArticleReader
              videoDbId={video.id}
              transcriptStatus={transcriptStatus}
              onTranscriptStatusChange={setTranscriptStatus}
            />
          </div>
          <div className={activeTab === 'transcript' ? '' : 'hidden'}>
            <TranscriptReader
              videoDbId={video.id}
              sourceId={video.sourceId}
              transcriptStatus={transcriptStatus}
              onTranscriptStatusChange={setTranscriptStatus}
            />
          </div>
        </div>
      </article>
    </div>
  );
}
