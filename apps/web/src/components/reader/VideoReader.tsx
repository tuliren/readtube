'use client';

import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { NotebookPen } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { formatDurationSeconds } from '@/lib/format/duration';
import type { VideoData } from '@/lib/types';

import ArticleReader from './ArticleReader';
import NotesPanel from './NotesPanel';
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
  // The reader URL is `/inbox/<id>?returnTo=<encoded-inbox-query>`. The
  // `returnTo` value is the literal query string
  // (channelId=abc&starred=1) that the user came from, so the Back
  // link can re-mount the inbox with the exact same filter state.
  // Falls back to plain `/inbox` when there's no `returnTo` (deep
  // links, fresh sessions). The param name is intentionally NOT
  // `from` because that collides with InboxQuery.from (date range).
  const returnToParam = searchParams.get('returnTo');
  const backHref =
    returnToParam != null && returnToParam.length > 0 ? `/inbox?${returnToParam}` : '/inbox';
  const watchUrl = `https://youtube.com/watch?v=${video.sourceId}`;

  // Default to Summary because that's the cheapest scannable view —
  // the previous default of Transcript meant every reader open
  // landed on the densest, longest content first.
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const durationLabel = formatDurationSeconds(video.durationSeconds);

  // Shared transcript availability state across all three tabs.
  // Seeded from the SSR-rendered VideoData: an already-flagged
  // captionless video opens straight into the unavailable state, an
  // already-cached transcript starts as 'present' (so its tab dot
  // is blue from the first render), everything else is 'unknown'.
  const initialTranscriptStatus: TranscriptStatus = video.transcriptUnavailable
    ? 'unavailable'
    : video.hasTranscript
      ? 'present'
      : 'unknown';
  const [transcriptStatus, setTranscriptStatus] =
    useState<TranscriptStatus>(initialTranscriptStatus);

  // hasSummary / hasArticle are lifted into local state too so the
  // tab dots can flip from red to blue the moment a generate
  // succeeds in the same session. The SSR props on `video` are a
  // snapshot from page load — they never update unless the user
  // refreshes — so if the dots were derived from them directly the
  // user would generate a summary, see the content stream in, and
  // the tab dot would still be red until the next reload.
  const [hasSummary, setHasSummary] = useState<boolean>(video.hasSummary);
  const [hasArticle, setHasArticle] = useState<boolean>(video.hasArticle);

  // useState only seeds from the initial render. When the user clicks
  // a different video in the sidebar Next.js performs a soft
  // navigation — VideoReader receives new props but is NOT
  // remounted, so transcriptStatus / hasSummary / hasArticle would
  // otherwise stay at the previous video's values. If the previous
  // video was unavailable the new (perfectly fine) video would
  // render as "no transcript" across all three tabs; if the previous
  // video had a generated summary the new video's Summary tab dot
  // would falsely be blue. Resync everything on every video identity
  // change.
  useEffect(() => {
    setTranscriptStatus(
      video.transcriptUnavailable ? 'unavailable' : video.hasTranscript ? 'present' : 'unknown'
    );
    setHasSummary(video.hasSummary);
    setHasArticle(video.hasArticle);
  }, [
    video.id,
    video.transcriptUnavailable,
    video.hasTranscript,
    video.hasSummary,
    video.hasArticle,
  ]);

  // Derived flag for the Transcript tab dot — once transcriptStatus
  // is 'present', a transcript exists in the cache. Keeps the dot's
  // source of truth in one place rather than maintaining a parallel
  // hasTranscript local state that could drift.
  const hasTranscript = transcriptStatus === 'present';

  // Stable callbacks the children pass into their effect dep arrays.
  // useState's setters are already stable, but wrapping the
  // single-update closures in useCallback gives a clean reference
  // that satisfies react-hooks/exhaustive-deps without triggering
  // an effect re-run on every parent render.
  const handleSummaryAvailable = useCallback(() => setHasSummary(true), []);
  const handleArticleAvailable = useCallback(() => setHasArticle(true), []);

  // Notes panel state — auto-open when arriving with ?openNotes=1
  const [notesOpen, setNotesOpen] = useState(() => searchParams.get('openNotes') === '1');
  const handleNotesOpenChange = useCallback((open: boolean) => setNotesOpen(open), []);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/*
        Back nav + triage actions + notes toggle. The header bar
        deliberately bypasses the article's `mx-auto max-w-3xl` indent
        and uses px-3 directly, matching the Channels-section header on
        the sidebar — both category headers should hug the pane edge
        with the same 12px-from-the-edge action rail.
      */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-3 py-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 px-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => setNotesOpen((prev) => !prev)}
            >
              <NotebookPen className="h-4 w-4" />
              Notes
            </Button>
            <VideoReaderActions video={video} />
          </div>
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

          {/* Thumbnail + description row — thumbnail sits to the left
            of the description at the same height so it reads as one
            unit. When there's no description the thumbnail still
            renders standalone; when there's no thumbnail the
            description spans the full width. */}
          {(video.thumbnailUrl != null || video.description != null) && (
            <div className="mt-5 flex items-start gap-4">
              {video.thumbnailUrl != null && (
                <img
                  src={video.thumbnailUrl}
                  alt={video.title}
                  className="w-40 shrink-0 rounded-lg object-cover"
                  loading="eager"
                />
              )}
              {video.description != null && (
                <blockquote className="min-w-0 flex-1 border-l-2 border-gray-200 pl-4 text-sm leading-relaxed text-gray-500 italic">
                  {video.description}
                </blockquote>
              )}
            </div>
          )}

          {transcriptStatus === 'unavailable' ? (
            // Transcript is sticky-unavailable for this video — there's
            // nothing the AI tabs can produce. Skip the tab bar entirely
            // and render a single "no transcript" notice with a YouTube
            // link, so the user has one obvious next step instead of
            // three tabs that all show the same message.
            <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-6 text-center">
              <p className="text-base font-medium text-amber-800">
                No transcript is available for this video
              </p>
              <p className="mt-2 text-sm text-amber-700">
                For now, ReadTube can only generate a summary or article when YouTube provides a
                native transcript for the video. Support for videos without captions is on the
                roadmap.
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
                        ? hasSummary
                        : tab.key === 'article'
                          ? hasArticle
                          : hasTranscript;
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
                    onSummaryAvailable={handleSummaryAvailable}
                  />
                </div>
                <div className={activeTab === 'article' ? '' : 'hidden'}>
                  <ArticleReader
                    videoDbId={video.id}
                    transcriptStatus={transcriptStatus}
                    onTranscriptStatusChange={setTranscriptStatus}
                    onArticleAvailable={handleArticleAvailable}
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
      <NotesPanel videoId={video.id} open={notesOpen} onOpenChange={handleNotesOpenChange} />
    </div>
  );
}
