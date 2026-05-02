'use client';

import { ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { Loader2, NotebookPen } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

import CopyButton from '@/components/CopyButton';
import ExternalLinkActions from '@/components/ExternalLinkActions';
import { Button } from '@/components/ui/button';
import { formatDurationSeconds } from '@/lib/format/duration';
import { findTargetLanguage } from '@/lib/language/names';
import type { VideoData } from '@/lib/types';
import { channelHref } from '@/lib/urls/channelHref';
import { videoHref } from '@/lib/urls/videoHref';
import { buildChannelLink, buildWatchLink } from '@/lib/urls/watchUrl';

import ArticleReader from './ArticleReader';
import FollowChannelDialogButton from './FollowChannelDialogButton';
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
  /** Whether the current user is subscribed to the video's channel.
   *  Only meaningful in authenticated (non-public) mode — drives the
   *  "Follow channel" plus-icon button next to the channel name. When
   *  true (or in public mode) the button is hidden. */
  channelFollowed?: boolean;
  /** User's default reader language (BCP-47), or null = "Original".
   *  Pre-selects the language picker in the Summary/Article tabs. Not
   *  meaningful in public mode (those views always render the Original
   *  row regardless of any visitor preference). */
  preferredLanguage?: string | null;
  /** Optional content rendered at the end of the scrollable reader pane.
   *  Public-share pages pass a compact footer here so the legal links
   *  flow with the article instead of pinning to the viewport bottom. */
  footerSlot?: ReactNode;
}

type Tab = 'summary' | 'article' | 'transcript';
export type TranscriptStatus = 'unknown' | 'present' | 'unavailable';
const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'article', label: 'Article' },
  { key: 'transcript', label: 'Transcript' },
];

function isValidTab(value: string | null): value is Tab {
  return value === 'summary' || value === 'article' || value === 'transcript';
}

function relativeDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function VideoReader({
  video,
  publicMode = false,
  channelFollowed = false,
  preferredLanguage = null,
  footerSlot = null,
}: Props) {
  const searchParams = useSearchParams();

  // Picker state lives at the VideoReader level so:
  //  - Summary and Article tabs stay in sync (changing the language on
  //    one doesn't strand the other in a different language).
  //  - The Share link can append `?language=...` so a recipient lands
  //    on the same translation the sharer was looking at.
  // In private mode the URL's `?language=` param seeds the picker so
  // refresh and link-share preserve the chosen translation. Public
  // mode gets its language injected via the `preferredLanguage` prop
  // (parsed server-side in /p/videos/[videoId]/page.tsx), so reading
  // here would just duplicate that.
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(() => {
    if (!publicMode) {
      const fromUrl = searchParams.get('language');
      if (fromUrl != null && fromUrl.length > 0 && findTargetLanguage(fromUrl) != null) {
        return fromUrl;
      }
    }
    return preferredLanguage;
  });
  const shareHref =
    selectedLanguage == null
      ? `/p${videoHref(video)}`
      : `/p${videoHref(video)}?language=${encodeURIComponent(selectedLanguage)}`;
  // Sentinel key for the `language=null` (Original) row so per-
  // language records can use a uniform Record<string, boolean>.
  const selectedLanguageKey = selectedLanguage ?? '__original__';
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
  const { url: channelUrl } = buildChannelLink(video.platform, video.channelSourceId);

  // Default to Summary because that's the cheapest scannable view.
  // `?tab=` in the URL overrides the default so refresh and
  // link-share preserve the chosen tab. In public mode the
  // Transcript tab is always hidden and Summary/Article are hidden
  // when their content doesn't exist — reject any URL value that
  // would resolve to a hidden tab so the viewer doesn't land on an
  // empty pane (e.g. shared `?tab=summary` URL whose summary was
  // since deleted, or a manually crafted URL). Falls through to the
  // mode-aware default below in that case.
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const fromUrl = searchParams.get('tab');
    if (isValidTab(fromUrl)) {
      if (!publicMode) {
        return fromUrl;
      }
      if (fromUrl === 'summary' && video.hasSummary) {
        return fromUrl;
      }
      if (fromUrl === 'article' && video.hasArticle) {
        return fromUrl;
      }
    }
    return publicMode && !video.hasSummary && video.hasArticle ? 'article' : 'summary';
  });
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

  // Per-language availability records, populated as Summary and
  // Article readers' fetches resolve. Drives the Share button's
  // visibility — Share appears only when the *currently selected*
  // language has at least one of summary/article. SSR's aggregate
  // flags can't answer this since "any language has content" isn't
  // the same as "this language has content". The sentinel
  // `__original__` keys the `language=null` (Original) row so it
  // can share the same Record<string, boolean> shape.
  const [summaryByLanguage, setSummaryByLanguage] = useState<Record<string, boolean>>({});
  const [articleByLanguage, setArticleByLanguage] = useState<Record<string, boolean>>({});

  // Gate the Share link — there's no point offering a `?language=`
  // URL whose target lands the recipient on an empty tab. A `false`
  // entry means the reader has fetched and confirmed the language
  // is empty; `undefined` means the fetch is still in flight, in
  // which case we hide too (brief hide-then-reveal is preferable to
  // teasing a 404).
  const currentLanguageHasContent =
    summaryByLanguage[selectedLanguageKey] === true ||
    articleByLanguage[selectedLanguageKey] === true;

  // Word counts streamed up from each reader so the tab header can
  // render a live "X min" reading-time badge. 0 means either "content
  // not loaded yet" or "not generated" — the tab header falls back to
  // the red dot indicator only when content is known to be missing.
  const [summaryWords, setSummaryWords] = useState(0);
  const [articleWords, setArticleWords] = useState(0);
  const [transcriptWords, setTranscriptWords] = useState(0);

  // Per-tab "generation in progress" flag. While true the tab header
  // hides the reading-time badge (which would tick up dishonestly as
  // partial deltas land) and shows a small spinner instead. Mirrors
  // the reader's local `status === 'generating'` / `'streaming'` so
  // the indicator covers both POST-driven and GET-tap-in flows.
  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [articleGenerating, setArticleGenerating] = useState(false);

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
  //
  // Skip the very first run via prevVideoIdRef — on initial mount the
  // useState initializers above already seeded the right values
  // (including URL-derived activeTab), and we don't want this effect
  // to clobber them back to the unconditional default.
  const prevVideoIdRef = useRef(video.id);
  useEffect(() => {
    if (prevVideoIdRef.current === video.id) {
      return;
    }
    prevVideoIdRef.current = video.id;
    setTranscriptStatus(
      video.transcriptUnavailable ? 'unavailable' : video.hasTranscript ? 'present' : 'unknown'
    );
    setHasSummary(video.hasSummary);
    setHasArticle(video.hasArticle);
    // Drop the previous video's per-language availability so the
    // Share button starts hidden until the new video's readers
    // re-report. Otherwise a stale `{ __original__: true }` from
    // video A could briefly show Share on video B.
    setSummaryByLanguage({});
    setArticleByLanguage({});
    setSummaryWords(0);
    setArticleWords(0);
    setTranscriptWords(0);
    setSummaryGenerating(false);
    setArticleGenerating(false);
    // Re-pick the default tab for the new video. A stale activeTab
    // from the previous video (e.g. 'transcript' on the way into a
    // public-mode video that hides it, or 'summary' on the way into
    // a public-mode article-only video where the Summary tab is
    // filtered out) would otherwise leave the viewer staring at an
    // empty pane.
    setActiveTab(publicMode && !video.hasSummary && video.hasArticle ? 'article' : 'summary');
  }, [
    video.id,
    video.transcriptUnavailable,
    video.hasTranscript,
    video.hasSummary,
    video.hasArticle,
    publicMode,
  ]);

  // Mirror the active tab into the URL as `?tab=...` (and, in private
  // mode, the selected language as `?language=...`) so refresh,
  // browser-back, and link-share preserve the view. Public mode
  // skips the language write because that param is already SSR'd by
  // /p/videos/[videoId]/page.tsx and rewriting it would round-trip
  // through the server on every refresh.
  //
  // Only write `?tab=` when the active tab differs from the mode-
  // aware default. This (a) keeps shared URLs clean when the user
  // hasn't moved off the default, and (b) drops an unreachable URL
  // value entirely instead of rewriting it — e.g. a shared
  // `?tab=summary` URL whose summary was later deleted falls back
  // to Article and gets the now-meaningless `?tab=` stripped, rather
  // than being rewritten to `?tab=article` and pinning the view.
  //
  // window.history.replaceState avoids the re-render / data-refetch
  // overhead of router.replace — we're just decorating the URL bar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    const defaultTab: Tab =
      publicMode && !video.hasSummary && video.hasArticle ? 'article' : 'summary';
    if (activeTab === defaultTab) {
      if (params.has('tab')) {
        params.delete('tab');
        changed = true;
      }
    } else if (params.get('tab') !== activeTab) {
      params.set('tab', activeTab);
      changed = true;
    }
    if (!publicMode) {
      const currentLang = params.get('language');
      if (selectedLanguage != null) {
        if (currentLang !== selectedLanguage) {
          params.set('language', selectedLanguage);
          changed = true;
        }
      } else if (currentLang != null) {
        params.delete('language');
        changed = true;
      }
    }
    if (changed) {
      const qs = params.toString();
      const newUrl = `${window.location.pathname}${qs.length > 0 ? `?${qs}` : ''}`;
      // Preserve `window.history.state` rather than overwriting it
      // with `null` — the Next.js App Router stores its own routing
      // metadata (tree keys, scroll position, etc.) in history.state,
      // and clobbering it can break soft back/forward navigation.
      window.history.replaceState(window.history.state, '', newUrl);
    }
    // video.id is in the dep array so soft-navigation between
    // videos re-decorates the new URL. Without it, navigating from
    // video A (?language=zh) to video B (no params) wouldn't re-run
    // the effect when the active tab and language match across the
    // two videos — the in-session language override would silently
    // disappear from the URL and be lost on the next refresh.
  }, [activeTab, selectedLanguage, publicMode, video.id, video.hasSummary, video.hasArticle]);

  // Public mode: once a per-language fetch confirms the active tab is
  // empty for the selected language, redirect to the other tab if it
  // has content. The button is already hidden by the tabs filter, but
  // an SSR'd `?tab=summary` URL (or a tab whose content was
  // subsequently deleted) would otherwise leave the reader staring at
  // a blank pane. Falls through silently when both are empty — the
  // page-level 404 in /p/videos/[videoId] catches the all-empty case
  // for the aggregate, and a per-language all-empty state is rare
  // enough that an empty pane is acceptable.
  useEffect(() => {
    if (!publicMode) {
      return;
    }
    const summaryAvailable = summaryByLanguage[selectedLanguageKey] ?? hasSummary;
    const articleAvailable = articleByLanguage[selectedLanguageKey] ?? hasArticle;
    if (activeTab === 'summary' && !summaryAvailable && articleAvailable) {
      setActiveTab('article');
    } else if (activeTab === 'article' && !articleAvailable && summaryAvailable) {
      setActiveTab('summary');
    }
  }, [
    publicMode,
    activeTab,
    summaryByLanguage,
    articleByLanguage,
    selectedLanguageKey,
    hasSummary,
    hasArticle,
  ]);

  // Stable callbacks the children pass into their effect dep arrays.
  // useState's setters are already stable, but wrapping the
  // single-update closures in useCallback gives a clean reference
  // that satisfies react-hooks/exhaustive-deps without triggering
  // an effect re-run on every parent render.
  // Combined per-language availability handler: updates the per-
  // language map (drives Share gating) and, on the affirmative
  // signal, also flips the aggregate boolean (drives the tab dot
  // and public-mode tab filtering). Aggregate stays monotonic — a
  // language reporting `false` doesn't flip the dot back to red,
  // because some other language may still have content.
  const handleSummaryAvailability = useCallback((language: string | null, available: boolean) => {
    const key = language ?? '__original__';
    setSummaryByLanguage((prev) =>
      prev[key] === available ? prev : { ...prev, [key]: available }
    );
    if (available) {
      setHasSummary(true);
    }
  }, []);
  const handleArticleAvailability = useCallback((language: string | null, available: boolean) => {
    const key = language ?? '__original__';
    setArticleByLanguage((prev) =>
      prev[key] === available ? prev : { ...prev, [key]: available }
    );
    if (available) {
      setHasArticle(true);
    }
  }, []);
  const handleSummaryWordsChange = useCallback((words: number) => setSummaryWords(words), []);
  const handleArticleWordsChange = useCallback((words: number) => setArticleWords(words), []);
  const handleTranscriptWordsChange = useCallback((words: number) => setTranscriptWords(words), []);
  const handleSummaryGeneratingChange = useCallback(
    (generating: boolean) => setSummaryGenerating(generating),
    []
  );
  const handleArticleGeneratingChange = useCallback(
    (generating: boolean) => setArticleGenerating(generating),
    []
  );

  // Description collapse state — collapsed by default to keep the header compact.
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  // Whether the description actually overflows the 4-line clamp. Short
  // descriptions render no "Show more" toggle because there is nothing
  // to reveal.
  const [isDescriptionClampable, setIsDescriptionClampable] = useState(false);
  const descriptionRef = useRef<HTMLQuoteElement>(null);

  // Reset description collapse when navigating to a different video.
  useEffect(() => {
    setDescriptionExpanded(false);
    setIsDescriptionClampable(false);
  }, [video.id]);

  // Measure whether the description overflows its 4-line clamp so the
  // "Show more" toggle only renders when there is actually more to
  // reveal. Re-measures on resize so a narrower viewport that clips
  // previously-fitting text still gets a toggle. video.id is in the
  // deps so that navigating between videos with identical descriptions
  // still re-measures (the reset effect above clears clampable to
  // false, and a same-size ResizeObserver won't fire on its own).
  useEffect(() => {
    const el = descriptionRef.current;
    if (el == null) {
      return;
    }
    const measure = () => {
      // scrollHeight > clientHeight is only meaningful while the clamp
      // is applied. Once expanded, keep the existing value — if it
      // was clampable before, it still is.
      if (descriptionExpanded) {
        return;
      }
      setIsDescriptionClampable(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [video.id, video.description, descriptionExpanded]);

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
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        {/*
        Back nav + triage actions + notes toggle. The header bar
        deliberately bypasses the article's `mx-auto max-w-3xl` indent
        and uses px-3 directly, matching the Channels-section header on
        the sidebar — both category headers should hug the pane edge
        with the same 12px-from-the-edge action rail.
      */}
        {!publicMode && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-3 py-3">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 px-2 text-sm text-muted-foreground hover:text-foreground"
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
                  <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                    {noteCount}
                  </span>
                )}
              </Button>
              <VideoReaderActions video={video} />
            </div>
          </div>
        )}

        {/* Article */}
        <article
          className={`mx-auto w-full max-w-3xl px-6 pt-8 ${footerSlot != null ? 'pb-4' : 'pb-8'}`}
        >
          {/* Meta: video title */}
          <h1 className="text-2xl font-bold leading-tight text-foreground">
            {video.thumbnailUrl != null && (
              <img
                src={video.thumbnailUrl}
                alt=""
                aria-hidden
                referrerPolicy="no-referrer"
                // Inline thumbnail sized to the title's line-height.
                // Only shown on narrow screens, where the full
                // thumbnail row is hidden.
                className="mr-1.5 inline-block h-[1.25em] w-auto rounded align-middle sidebar:hidden"
              />
            )}
            {video.title}
          </h1>

          {/* Meta line */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-0.5">
              {!publicMode && channelFollowed ? (
                // Subscribed users get an in-app link to the channel's
                // inbox view. Distinct from the small external-link
                // glyph next to it, which still opens the upstream
                // channel page on YouTube/Bilibili. Public viewers
                // (and unsubscribed reader visits) keep the plain
                // text label since they have no channel page to
                // route to.
                <Link
                  href={channelHref({
                    handle: video.channelHandle,
                    sourceId: video.channelSourceId,
                  })}
                  className="hover:text-foreground hover:underline"
                >
                  {video.channelName}
                </Link>
              ) : (
                <span>{video.channelName}</span>
              )}
              <ExternalLinkActions url={channelUrl} label={`Open channel on ${platformName}`} />
              {!publicMode && !channelFollowed && (
                <FollowChannelDialogButton
                  // Soft navigation between videos reuses this tree
                  // position, so the button's internal `followed`
                  // flag would otherwise persist across channels and
                  // hide itself for every subsequent unfollowed
                  // channel. Keying on channelSourceId forces a
                  // remount when the channel identity changes.
                  key={video.channelSourceId}
                  channelName={video.channelName}
                  channelUrl={channelUrl}
                />
              )}
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
            {!publicMode && currentLanguageHasContent && (
              <>
                <span>·</span>
                {/*
                  Link to the public mirror so the sharer (who is
                  authenticated + subscribed) sees the same
                  stripped-down view a recipient does, and the URL
                  they paste elsewhere is the canonical share URL.
                  Carries the picker's current language as
                  `?language=` so the recipient lands on the same
                  translation the sharer was looking at.
                */}
                <span className="inline-flex items-center gap-0.5">
                  <Link href={shareHref} target="_blank" className="text-blue-500 hover:underline">
                    Share ↗
                  </Link>
                  <CopyButton value={shareHref} label="Copy share link" />
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
            <div
              className={`mt-5 items-start gap-4 ${
                // Thumbnail-only videos collapse to an empty row on
                // narrow screens (the thumbnail is hidden), so hide
                // the whole row below the sidebar breakpoint in that
                // case to avoid a stray 20px gap.
                video.description == null ? 'hidden sidebar:flex' : 'flex'
              }`}
            >
              {video.thumbnailUrl != null && (
                <img
                  // Bilibili's hdslb CDN 403s when the Referer points
                  // at a non-bilibili origin, AND 403s on HTTPS for
                  // some paths (observed on `/bfs/face/`, seen rarely
                  // on `/bfs/archive/`). Use the URL verbatim —
                  // stored with the correct protocol by the server
                  // scrapers — and drop the Referer so either
                  // protocol works.
                  src={video.thumbnailUrl}
                  alt={video.title}
                  // Hidden below the sidebar breakpoint so the
                  // description gets full width on narrow screens.
                  className="hidden w-40 shrink-0 rounded-lg object-cover sidebar:block"
                  loading="eager"
                  referrerPolicy="no-referrer"
                />
              )}
              {video.description != null && (
                <div className="min-w-0 flex-1">
                  <blockquote
                    ref={descriptionRef}
                    className={`whitespace-pre-line border-l-2 border-border pl-4 text-sm leading-relaxed text-muted-foreground italic ${
                      descriptionExpanded ? '' : 'line-clamp-4'
                    }`}
                  >
                    {video.description}
                  </blockquote>
                  {isDescriptionClampable && (
                    <button
                      onClick={() => setDescriptionExpanded((prev) => !prev)}
                      className="mt-1 flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
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
                  )}
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
            <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-6 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="text-base font-medium text-amber-800 dark:text-amber-200">
                No transcript is available for this video
              </p>
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
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
              <div className="mt-8 overflow-x-auto overflow-y-hidden border-b border-border">
                <div className="flex gap-6">
                  {TABS.filter((tab) => {
                    if (tab.key === 'transcript') {
                      return !publicMode;
                    }
                    // In public mode the reader can't generate
                    // anything — hide tabs whose content doesn't
                    // exist so the viewer isn't teased with an empty
                    // panel. Prefer the per-language signal once the
                    // reader has reported it (false = confirmed empty
                    // for the selected language), and fall back to the
                    // aggregate SSR flag while the fetch is in flight
                    // so a slow API doesn't briefly hide a tab whose
                    // content actually exists.
                    if (publicMode && tab.key === 'summary') {
                      return summaryByLanguage[selectedLanguageKey] ?? hasSummary;
                    }
                    if (publicMode && tab.key === 'article') {
                      return articleByLanguage[selectedLanguageKey] ?? hasArticle;
                    }
                    return true;
                  }).map((tab) => {
                    const words =
                      tab.key === 'summary'
                        ? summaryWords
                        : tab.key === 'article'
                          ? articleWords
                          : transcriptWords;
                    // Suppress the reading-time badge while a
                    // generation is mid-flight — the word count is
                    // ticking up dishonestly as partial deltas land,
                    // and "1 min" → "3 min" → "5 min" just as the
                    // user is watching the article stream looks like
                    // a buggy estimate. Show a spinner instead so
                    // the tab still signals "this one is busy" but
                    // doesn't promise a length yet. Transcript tab
                    // never streams under our control, so it always
                    // shows the badge whenever it has words.
                    const isTabGenerating =
                      (tab.key === 'summary' && summaryGenerating) ||
                      (tab.key === 'article' && articleGenerating);
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-1 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                          activeTab === tab.key
                            ? 'border-foreground text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tab.label}
                        {isTabGenerating ? (
                          <Loader2
                            aria-label="Generating"
                            className="h-3.5 w-3.5 animate-spin text-blue-500"
                          />
                        ) : (
                          words > 0 && <ReadingTimeBadge wordCount={words} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tab content */}
              <div className="mt-6">
                {(!publicMode || (summaryByLanguage[selectedLanguageKey] ?? hasSummary)) && (
                  <div className={activeTab === 'summary' ? '' : 'hidden'}>
                    <SummaryReader
                      videoDbId={video.id}
                      videoTitle={video.title}
                      transcriptStatus={transcriptStatus}
                      onTranscriptStatusChange={setTranscriptStatus}
                      onSummaryAvailability={handleSummaryAvailability}
                      onSummaryWordsChange={handleSummaryWordsChange}
                      onSummaryGeneratingChange={handleSummaryGeneratingChange}
                      publicMode={publicMode}
                      selectedLanguage={selectedLanguage}
                      onLanguageChange={setSelectedLanguage}
                    />
                  </div>
                )}
                {(!publicMode || (articleByLanguage[selectedLanguageKey] ?? hasArticle)) && (
                  <div className={activeTab === 'article' ? '' : 'hidden'}>
                    <ArticleReader
                      videoDbId={video.id}
                      videoTitle={video.title}
                      transcriptStatus={transcriptStatus}
                      onTranscriptStatusChange={setTranscriptStatus}
                      onArticleAvailability={handleArticleAvailability}
                      onArticleWordsChange={handleArticleWordsChange}
                      onArticleGeneratingChange={handleArticleGeneratingChange}
                      publicMode={publicMode}
                      selectedLanguage={selectedLanguage}
                      onLanguageChange={setSelectedLanguage}
                    />
                  </div>
                )}
                {!publicMode && (
                  <div className={activeTab === 'transcript' ? '' : 'hidden'}>
                    <TranscriptReader
                      videoDbId={video.id}
                      sourceId={video.sourceId}
                      platform={video.platform}
                      transcriptStatus={transcriptStatus}
                      onTranscriptStatusChange={setTranscriptStatus}
                      onTranscriptWordsChange={handleTranscriptWordsChange}
                    />
                  </div>
                )}
              </div>

              {/* AI disclaimer — only meaningful for AI-generated tabs
                  (Summary, Article). Hidden on the Transcript tab,
                  which surfaces raw captions, not model output. */}
              {(activeTab === 'summary' || activeTab === 'article') && (
                <p className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
                  This content is generated by AI from the video&rsquo;s transcript and may contain
                  errors, omissions, or misinterpretations. Treat it as a quick reference, not a
                  substitute for the original.
                </p>
              )}
            </>
          )}
        </article>
        {footerSlot}
      </div>
      {!publicMode && (
        <NotesPanel videoId={video.id} open={notesOpen} onOpenChange={handleNotesOpenChange} />
      )}
    </div>
  );
}
