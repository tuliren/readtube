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
  // The reader URL is `/inbox/<id>?from=<encoded-inbox-query>`. The
  // `from` value is the literal query string (channelId=abc&starred=1)
  // that the user came from, so the Back link can re-mount the inbox
  // with the exact same filter state. Falls back to plain `/inbox`
  // when there's no `from` (deep links, fresh sessions).
  const fromParam = searchParams.get('from');
  const backHref = fromParam != null && fromParam.length > 0 ? `/inbox?${fromParam}` : '/inbox';
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

        {transcriptStatus === 'unavailable' ? (
          // Transcript is sticky-unavailable for this video — there's
          // nothing the AI tabs can produce. Skip the tab bar entirely
          // and render a single "no transcript" notice with a YouTube
          // link, so the user has one obvious next step instead of
          // three tabs that all show the same message.
          <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-6 text-center">
            <p className="text-sm font-medium text-amber-800">
              No transcript is available for this video
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Without captions there&rsquo;s nothing for the summary, article, or transcript tabs to
              work with.
            </p>
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
            >
              Watch on YouTube ↗
            </a>
          </div>
        ) : (
          <>
            {/* Tabs — Summary first because it's the cheapest scannable
                view, then Article (the long-form rewrite), then Transcript
                (the raw firehose). Each tab carries a small dot:
                  - blue when the corresponding artifact has been generated
                  - red when no content exists yet for that tab
                The dot color is stable across active/inactive states so
                the signal doesn't depend on which tab the user clicked. */}
            <div className="mt-8 border-b border-gray-200">
              <div className="flex gap-6">
                {TABS.map((tab) => {
                  const generated =
                    tab.key === 'summary'
                      ? video.hasSummary
                      : tab.key === 'article'
                        ? video.hasArticle
                        : video.hasTranscript;
                  const dotColor = generated ? 'bg-blue-500' : 'bg-red-500';
                  const dotTitle = generated
                    ? `${tab.label} already generated`
                    : `${tab.label} not generated yet`;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                        activeTab === tab.key
                          ? 'border-gray-900 text-gray-900'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {tab.label}
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`}
                        title={dotTitle}
                        aria-label={dotTitle}
                      />
                    </button>
                  );
                })}
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
          </>
        )}
      </article>
    </div>
  );
}
