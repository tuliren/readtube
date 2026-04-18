'use client';

import { ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { NotebookPen } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';

import CopyButton from '@/components/CopyButton';
import ExternalLinkActions from '@/components/ExternalLinkActions';
import { Button } from '@/components/ui/button';
import { formatDurationSeconds } from '@/lib/format/duration';
import type { VideoData } from '@/lib/types';
import { videoHref } from '@/lib/urls/videoHref';
import { buildWatchLink } from '@/lib/urls/watchUrl';

import ArticleReader from './ArticleReader';
import NotesPanel from './NotesPanel';
import ReadingTimeBadge from './ReadingTimeBadge';
import SummaryReader from './SummaryReader';
import TranscriptReader from './TranscriptReader';
import VideoReaderActions from './VideoReaderActions';

interface Props {
  video: VideoData;
  /** Public, unauthenticated view. Hides user-specific UI (notes,
   *  triage actions, back link) and swaps the tab readers to the
   *  public, read-only API routes. */
  publicMode?: boolean;
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

export default function VideoReader({ video, publicMode = false }: Props) {
  const searchParams = useSearchParams();
  // The reader URL is `/videos/<sourceId>?returnTo=<encoded-path>`.
  // `returnTo` carries the full path + query of the list the user
  // came from (e.g. `/inbox?starred=1` or `/channels/@mkbhd`). Falls
  // back to plain `/inbox` on deep links. The param name is
  // intentionally NOT `from` because that collides with
  // InboxQuery.from (date range).
  //
  // Reject anything that isn't a same-origin path — the value is
  // attacker-controllable via the URL, and <Link> happily navigates
  // to `https://evil.com` or a protocol-relative `//evil.com`. The
  // allowlist is "starts with `/` AND the second char isn't `/`".
  const returnToParam = searchParams.get('returnTo');
  const isSafeReturnTo =
    returnToParam != null &&
    returnToParam.length > 0 &&
    returnToParam.startsWith('/') &&
    !returnToParam.startsWith('//');
  const backHref = isSafeReturnTo ? returnToParam : '/inbox';
  const { url: watchUrl, platformName } = buildWatchLink(video.platform, video.sourceId);

  // Default to Summary because that's the cheapest scannable view —
  // the previous default of Transcript meant every reader open
  // landed on the densest, longest content first. In public mode
  // fall back to Article if the shared video has only an article.
  const [activeTab, setActiveTab] = useState<Tab>(
    publicMode && !video.hasSummary && video.hasArticle ? 'article' : 'summary'
  );
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

  // Word counts streamed up from each reader so the tab header can
  // render a live "X min" reading-time badge. 0 means either "content
  // not loaded yet" or "not generated" — the tab header falls back to
  // the red dot indicator only when content is known to be missing.
  const [summaryWords, setSummaryWords] = useState(0);
  const [articleWords, setArticleWords] = useState(0);
  const [transcriptWords, setTranscriptWords] = useState(0);

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
    setSummaryWords(0);
    setArticleWords(0);
    setTranscriptWords(0);
    // Re-pick the default tab for the new video. In public mode tabs
    // are conditionally rendered, so a stale activeTab from the
    // previous video can leave the viewer staring at an empty pane
    // when the new video lacks that tab's content.
    setActiveTab(publicMode && !video.hasSummary && video.hasArticle ? 'article' : 'summary');
  }, [
    video.id,
    video.transcriptUnavailable,
    video.hasTranscript,
    video.hasSummary,
    video.hasArticle,
    publicMode,
  ]);

  // Stable callbacks the children pass into their effect dep arrays.
  // useState's setters are already stable, but wrapping the
  // single-update closures in useCallback gives a clean reference
  // that satisfies react-hooks/exhaustive-deps without triggering
  // an effect re-run on every parent render.
  const handleSummaryAvailable = useCallback(() => setHasSummary(true), []);
  const handleArticleAvailable = useCallback(() => setHasArticle(true), []);
  const handleSummaryWordsChange = useCallback((words: number) => setSummaryWords(words), []);
  const handleArticleWordsChange = useCallback((words: number) => setArticleWords(words), []);
  const handleTranscriptWordsChange = useCallback((words: number) => setTranscriptWords(words), []);

  // Description collapse state — collapsed by default to keep the header compact.
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  // Reset description collapse when navigating to a different video.
  useEffect(() => {
    setDescriptionExpanded(false);
  }, [video.id]);

  // Notes panel state — auto-open when arriving with ?openNotes=1
  const [notesOpen, setNotesOpen] = useState(() => searchParams.get('openNotes') === '1');
  const handleNotesOpenChange = useCallback((open: boolean) => setNotesOpen(open), []);

  // Live note count — shares the SWR cache key with NotesPanel so the
  // badge updates immediately when notes are added or deleted. The
  // fetcher must match NotesPanel's (throw on error) so SWR doesn't
  // cache [] as valid data on a transient API failure.
  const { data: notesData } = useSWR<unknown[]>(
    publicMode ? null : `/api/videos/${video.id}/notes`,
    (url: string) =>
      fetch(url).then((r) => {
        if (!r.ok) {
          throw new Error(`Request failed (${r.status})`);
        }
        return r.json();
      })
  );
  const noteCount = Array.isArray(notesData) ? notesData.length : video.noteCount;

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
        {!publicMode && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-3 py-3">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 px-2 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </Link>
            <div className="flex items-center gap-0.5 sidebar:gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => setNotesOpen((prev) => !prev)}
                title="Notes"
              >
                <NotebookPen className="h-4 w-4" />
                <span className="hidden sidebar:inline">Notes</span>
                {noteCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">
                    {noteCount}
                  </span>
                )}
              </Button>
              <VideoReaderActions video={video} />
            </div>
          </div>
        )}

        {/* Article */}
        <article className="mx-auto w-full max-w-3xl px-6 py-8">
          {/* Meta: video title */}
          <h1 className="text-2xl font-bold leading-tight text-gray-900">{video.title}</h1>

          {/* Meta line */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-400">
            <span className="inline-flex items-center gap-0.5">
              <span>{video.channelName}</span>
              <ExternalLinkActions
                url={`https://www.youtube.com/channel/${video.channelSourceId}`}
                label="Open channel on YouTube"
              />
            </span>
            {video.publishedAt != null && (
              <>
                <span>·</span>
                <span>{relativeDate(video.publishedAt)}</span>
              </>
            )}
            {durationLabel != null && (
              <>
                <span>·</span>
                <span>{durationLabel}</span>
              </>
            )}
            <span>·</span>
            <span className="inline-flex items-center gap-0.5">
              <a
                href={watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                Watch on {platformName} ↗
              </a>
              <CopyButton value={watchUrl} label={`Copy ${platformName} link`} />
            </span>
            {!publicMode && (hasSummary || hasArticle) && (
              <>
                <span>·</span>
                {/*
                  Link to the public mirror so the sharer (who is
                  authenticated + subscribed) sees the same
                  stripped-down view a recipient does, and the URL
                  they paste elsewhere is the canonical share URL.
                */}
                <span className="inline-flex items-center gap-0.5">
                  <Link
                    href={`/p${videoHref(video)}`}
                    target="_blank"
                    className="text-blue-500 hover:underline"
                  >
                    Share ↗
                  </Link>
                  <CopyButton value={`/p${videoHref(video)}`} label="Copy share link" />
                </span>
              </>
            )}
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
                  // Bilibili's i0.hdslb.com CDN 403s with a non-bilibili
                  // Referer, and its JSON API returns http:// URLs that
                  // would otherwise be blocked as mixed content. Strip
                  // the Referer and coerce to https so both YouTube
                  // and Bilibili thumbnails load uniformly.
                  src={video.thumbnailUrl.replace(/^http:\/\//, 'https://')}
                  alt={video.title}
                  className="w-40 shrink-0 rounded-lg object-cover"
                  loading="eager"
                  referrerPolicy="no-referrer"
                />
              )}
              {video.description != null && (
                <div className="min-w-0 flex-1">
                  <blockquote
                    className={`whitespace-pre-line border-l-2 border-gray-200 pl-4 text-sm leading-relaxed text-gray-500 italic ${
                      descriptionExpanded ? '' : 'line-clamp-4'
                    }`}
                  >
                    {video.description}
                  </blockquote>
                  <button
                    onClick={() => setDescriptionExpanded((prev) => !prev)}
                    className="mt-1 flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600"
                  >
                    {descriptionExpanded ? (
                      <>
                        Show less <ChevronUpIcon className="h-3 w-3" />
                      </>
                    ) : (
                      <>
                        Show more <ChevronDownIcon className="h-3 w-3" />
                      </>
                    )}
                  </button>
                </div>
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
                For now, ReadTube can only generate a summary or article when {platformName}{' '}
                provides a native transcript for the video. Support for videos without captions is
                on the roadmap.
              </p>
              <a
                href={watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
              >
                Watch on {platformName} ↗
              </a>
            </div>
          ) : (
            <>
              {/* Tabs — Summary first because it's the cheapest scannable
                view, then Article (the long-form rewrite), then Transcript
                (the raw firehose). Tabs with generated content show a
                reading-time badge; missing content shows nothing. */}
              <div className="mt-8 border-b border-gray-200">
                <div className="flex gap-6">
                  {TABS.filter((tab) => {
                    if (tab.key === 'transcript') {
                      return !publicMode;
                    }
                    // In public mode the reader can't generate
                    // anything — hide tabs whose content doesn't
                    // exist so the viewer isn't teased with an empty
                    // panel.
                    if (publicMode && tab.key === 'summary') {
                      return hasSummary;
                    }
                    if (publicMode && tab.key === 'article') {
                      return hasArticle;
                    }
                    return true;
                  }).map((tab) => {
                    const words =
                      tab.key === 'summary'
                        ? summaryWords
                        : tab.key === 'article'
                          ? articleWords
                          : transcriptWords;
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
                        {words > 0 && <ReadingTimeBadge wordCount={words} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tab content */}
              <div className="mt-6">
                {(!publicMode || hasSummary) && (
                  <div className={activeTab === 'summary' ? '' : 'hidden'}>
                    <SummaryReader
                      videoDbId={video.id}
                      transcriptStatus={transcriptStatus}
                      onTranscriptStatusChange={setTranscriptStatus}
                      onSummaryAvailable={handleSummaryAvailable}
                      onSummaryWordsChange={handleSummaryWordsChange}
                      publicMode={publicMode}
                    />
                  </div>
                )}
                {(!publicMode || hasArticle) && (
                  <div className={activeTab === 'article' ? '' : 'hidden'}>
                    <ArticleReader
                      videoDbId={video.id}
                      transcriptStatus={transcriptStatus}
                      onTranscriptStatusChange={setTranscriptStatus}
                      onArticleAvailable={handleArticleAvailable}
                      onArticleWordsChange={handleArticleWordsChange}
                      publicMode={publicMode}
                    />
                  </div>
                )}
                {!publicMode && (
                  <div className={activeTab === 'transcript' ? '' : 'hidden'}>
                    <TranscriptReader
                      videoDbId={video.id}
                      sourceId={video.sourceId}
                      transcriptStatus={transcriptStatus}
                      onTranscriptStatusChange={setTranscriptStatus}
                      onTranscriptWordsChange={handleTranscriptWordsChange}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </article>
      </div>
      {!publicMode && (
        <NotesPanel videoId={video.id} open={notesOpen} onOpenChange={handleNotesOpenChange} />
      )}
    </div>
  );
}
