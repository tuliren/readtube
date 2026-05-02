'use client';

import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useEffect, useMemo, useState } from 'react';

import { countWords } from '@/lib/format/wordCount';
import { parseMarkdownDocument } from '@/lib/markdownFrontmatter';
import { consumeNdjsonStream } from '@/lib/reader/consumeNdjsonStream';
import { extractArticleHeadings } from '@/lib/reader/extractArticleHeadings';
import { useFollowBottom } from '@/lib/reader/useFollowBottom';
import { isProduction } from '@/lib/vercelEnv';

import ArticleMarkdown from './ArticleMarkdown';
import ExportMarkdownButtons from './ExportMarkdownButtons';
import FloatingToc from './FloatingToc';
import LanguagePicker, { languageQueryFragment } from './LanguagePicker';
import StreamingArticleBody from './StreamingArticleBody';
import type { TranscriptStatus } from './VideoReader';
import { type SectionState, createArticleStreamHandler } from './articleStreamHandler';

function RegenerateButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="Regenerate article"
      className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:hover:text-muted-foreground"
    >
      <ArrowPathIcon className="h-3.5 w-3.5" />
      Regenerate
    </button>
  );
}

interface Props {
  videoDbId: string;
  /** Used as the slug for the exported markdown file's name. */
  videoTitle: string;
  /** Shared transcript availability lifted from VideoReader. See the
   *  matching prop on SummaryReader for the longer explanation. */
  transcriptStatus: TranscriptStatus;
  onTranscriptStatusChange: (next: TranscriptStatus) => void;
  /** Reports per-language article availability up to VideoReader.
   *  Fires once per fetch resolution: `available=true` on the GET
   *  cache hit and after a successful generation, `available=false`
   *  on the 404 / fetch-error path. VideoReader uses this both to
   *  flip the Article tab dot blue (any language available) and to
   *  gate the Share link on whether the *currently selected*
   *  language has content. */
  onArticleAvailability: (language: string | null, available: boolean) => void;
  /** Reports the article word count up to VideoReader so the Article
   *  tab header can render the reading time badge. Fires on every
   *  markdown change, so the badge updates live as content streams. */
  onArticleWordsChange: (words: number) => void;
  /** Reports whether a generation is currently writing into this
   *  tab. VideoReader uses it to swap the reading-time badge for a
   *  spinner so the badge doesn't tick up dishonestly as partial
   *  deltas land. Covers both the POST-driven `'streaming'` state
   *  and the GET-tap-in path that lands in the same state. */
  onArticleGeneratingChange: (generating: boolean) => void;
  /** When true, fetch from the unauthenticated public endpoint and
   *  render a read-only view — no generate affordance. */
  publicMode?: boolean;
  /** Controlled picker selection lifted to VideoReader so Summary and
   *  Article stay in sync and the Share link can append the same
   *  `?language=`. null = Original. */
  selectedLanguage: string | null;
  onLanguageChange: (next: string | null) => void;
}

type Status = 'checking' | 'idle' | 'streaming' | 'done' | 'error';

const STYLE = 'NARRATIVE';

export default function ArticleReader({
  videoDbId,
  videoTitle,
  transcriptStatus,
  onTranscriptStatusChange,
  onArticleAvailability,
  onArticleWordsChange,
  onArticleGeneratingChange,
  publicMode = false,
  selectedLanguage,
  onLanguageChange,
}: Props) {
  const apiBase = publicMode ? '/api/public/videos' : '/api/videos';
  const [status, setStatus] = useState<Status>('checking');
  const [content, setContent] = useState('');
  const [hasLatex, setHasLatex] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Map-reduce progress indicators. Null/0 in single-pass mode.
  const [sectionsTotal, setSectionsTotal] = useState<number | null>(null);
  const [sectionsReady, setSectionsReady] = useState(0);
  const [reducing, setReducing] = useState(false);
  // Reserved for future UI use (showing alongside the video title).
  const [, setArticleTitle] = useState<string | null>(null);
  // Per-section state used to render section bodies + skeletons in the
  // gaps while map-reduce is still streaming. Populated by the stream
  // handler's `onSection` callback. Empty in single-pass mode.
  const [sectionStates, setSectionStates] = useState<Record<number, SectionState>>({});
  const [consolidatedHeadings, setConsolidatedHeadings] = useState<string[] | null>(null);

  // Auto-scroll the reader to the bottom while content streams in,
  // unless the user has scrolled away — the hook tracks that on its
  // own and resumes following if the user scrolls back near the end.
  const followBottomRef = useFollowBottom(status === 'streaming', [content]);

  useEffect(() => {
    let cancelled = false;
    setStatus('checking');
    setContent('');
    setHasLatex(false);
    setErrorMessage(null);
    setSectionsTotal(null);
    setSectionsReady(0);
    setReducing(false);
    setArticleTitle(null);
    setSectionStates({});
    setConsolidatedHeadings(null);

    const langFragment = languageQueryFragment(selectedLanguage);
    const url = `${apiBase}/${videoDbId}/article?style=${STYLE}&${langFragment}`;

    (async () => {
      let res: Response;
      try {
        res = await fetch(url);
      } catch {
        if (!cancelled) {
          setStatus('idle');
          onArticleAvailability(selectedLanguage, false);
        }
        return;
      }
      if (cancelled) {
        return;
      }
      if (res.status === 404 || !res.ok) {
        setStatus('idle');
        onArticleAvailability(selectedLanguage, false);
        return;
      }

      // Server signals "active workflow streaming" via the NDJSON
      // content-type. Tap into the stream so a refresh mid-generation
      // sees live progress instead of bouncing back to the Generate
      // button — see runRegistry on the server side.
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/x-ndjson')) {
        if (res.body == null) {
          setErrorMessage('No response body from server.');
          setStatus('error');
          return;
        }

        // Switch into streaming UX. Mirrors handleGenerate's setup so
        // the rendered article markdown grows live as events arrive.
        // Single-pass and map-reduce are auto-detected by the shared
        // handler.
        setStatus('streaming');
        setContent('');
        setHasLatex(false);
        setSectionsTotal(null);
        setSectionsReady(0);
        setReducing(false);
        setSectionStates({});
        setConsolidatedHeadings(null);

        const handler = createArticleStreamHandler({
          setContent,
          setHasLatex,
          setSectionsTotal,
          setSectionsReady,
          setReducing,
          setArticleTitle,
          onSection: (i, state) => setSectionStates((prev) => ({ ...prev, [i]: state })),
          setConsolidatedHeadings,
        });
        await consumeNdjsonStream(res.body, handler.onEvent);

        const finalState = handler.getState();
        if (cancelled) {
          return;
        }
        if (finalState.error != null) {
          setErrorMessage(finalState.error);
          setStatus('error');
          return;
        }
        if (!finalState.sawDone) {
          setErrorMessage(
            'Generation ended unexpectedly. Please refresh in a moment, or try again.'
          );
          setStatus('error');
          return;
        }
        if (!finalState.content.trim()) {
          setErrorMessage('No content was generated. Please try again.');
          setStatus('error');
          return;
        }
        setStatus('done');
        onArticleAvailability(selectedLanguage, true);
        return;
      }

      // application/json — cached Article row.
      const data = (await res.json()) as { content: string };
      if (cancelled) {
        return;
      }
      // Stored content carries a YAML frontmatter with hasLatex.
      // If the stored body happens to start with `---\n` but lacks
      // a closing fence (malformed / pre-migration), fall back to
      // the raw string so the user sees *something* rather than a
      // blank panel.
      const parsed = parseMarkdownDocument(data.content);
      setContent(parsed.frontmatterPending ? data.content : parsed.content);
      setHasLatex(parsed.properties.hasLatex === true);
      setStatus('done');
      // Cache hit — flip the parent's Article tab dot to blue
      // immediately, regardless of which tab the user is on. Also
      // marks this language as available so VideoReader can show
      // the Share button.
      onArticleAvailability(selectedLanguage, true);
    })();

    return () => {
      cancelled = true;
    };
  }, [videoDbId, onArticleAvailability, apiBase, selectedLanguage]);

  // Mirror the local streaming status up to VideoReader so the tab
  // header can swap the (mid-stream-misleading) reading-time badge
  // for a spinner. `'streaming'` covers both the POST-driven path
  // and the GET-tap-in path that flips into the same status when
  // the mount fetch sees NDJSON.
  useEffect(() => {
    onArticleGeneratingChange(status === 'streaming');
  }, [status, onArticleGeneratingChange]);

  // Stream the article word count up to VideoReader so the Article
  // tab header can render the reading-time badge. Fires on every
  // content change, including incremental streaming updates.
  useEffect(() => {
    onArticleWordsChange(countWords(content));
  }, [content, onArticleWordsChange]);

  // Recomputed on every content change so the TOC keeps up while the
  // article streams in. Cheap — one regex pass per line. Declared up
  // here with the other hooks so it stays above the status-specific
  // early returns below; moving it lower would trip rules-of-hooks.
  const tocItems = useMemo(() => extractArticleHeadings(content), [content]);

  async function handleGenerate(opts: { force?: boolean } = {}) {
    setStatus('streaming');
    setContent('');
    setHasLatex(false);
    setErrorMessage(null);
    setSectionsTotal(null);
    setSectionsReady(0);
    setReducing(false);
    setArticleTitle(null);
    setSectionStates({});
    setConsolidatedHeadings(null);

    try {
      const langFragment = languageQueryFragment(selectedLanguage);
      const res = await fetch(
        `/api/videos/${videoDbId}/article${langFragment ? `?${langFragment}` : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ style: STYLE, force: opts.force === true }),
        }
      );

      if (!res.ok) {
        // 410 from the server means ensureTranscript flagged this
        // video as transcript-unavailable. Flip the shared status so
        // Summary and Transcript tabs immediately render their
        // unavailable state too.
        if (res.status === 410) {
          onTranscriptStatusChange('unavailable');
          setErrorMessage('Transcript unavailable for this video.');
          setStatus('error');
          return;
        }
        // 503 means the upstream transcript provider blipped
        // (network error / 429 / 5xx). Surface a retry-friendly
        // error in THIS tab only — do NOT broadcast unavailable.
        if (res.status === 503) {
          const body = await res
            .json()
            .catch(() => ({ error: 'Transcript fetch failed temporarily — please try again.' }));
          setErrorMessage(body.error ?? 'Transcript fetch failed temporarily — please try again.');
          setStatus('error');
          return;
        }
        const body = await res.json().catch(() => ({ error: 'Failed to generate article.' }));
        setErrorMessage(body.error ?? 'Failed to generate article.');
        setStatus('error');
        return;
      }

      if (!res.body) {
        setErrorMessage('No response body from server.');
        setStatus('error');
        return;
      }

      // Reaching this point means the server's ensureTranscript call
      // already succeeded (otherwise it would have returned 410
      // before any stream body) — the transcript is now cached.
      // Broadcast 'present' so the Transcript tab loads it
      // automatically the moment the user switches over, instead of
      // still showing the Fetch button.
      onTranscriptStatusChange('present');

      // Parse NDJSON. Single-pass and map-reduce are auto-detected by
      // the shared handler — see articleStreamHandler.ts for the full
      // event vocabulary.
      const handler = createArticleStreamHandler({
        setContent,
        setHasLatex,
        setSectionsTotal,
        setSectionsReady,
        setReducing,
        setArticleTitle,
        onSection: (i, state) => setSectionStates((prev) => ({ ...prev, [i]: state })),
        setConsolidatedHeadings,
      });
      await consumeNdjsonStream(res.body, handler.onEvent);
      const finalState = handler.getState();

      if (finalState.error != null) {
        setErrorMessage(finalState.error);
        setStatus('error');
        return;
      }
      if (!finalState.sawDone) {
        // Stream closed without an explicit terminator. Could be a
        // workflow-runtime hiccup, a function timeout that bypassed
        // the terminal step, or a network drop. Don't trust the
        // accumulated content as a finished article — the workflow
        // may still be running and persisting in the background, and
        // a refresh will pick it up via the existing-article GET if
        // it does land.
        setErrorMessage('Generation ended unexpectedly. Please refresh in a moment, or try again.');
        setStatus('error');
        return;
      }
      if (!finalState.content.trim()) {
        setErrorMessage('No content was generated. Please try again.');
        setStatus('error');
        return;
      }

      setStatus('done');
      // Tell the parent the Article tab now has content for the
      // current language so its tab dot can flip from red → blue
      // and the Share button can appear, without waiting for a
      // refresh.
      onArticleAvailability(selectedLanguage, true);
    } catch (err) {
      console.error('[ArticleReader] stream error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to generate article.');
      setStatus('error');
    }
  }

  // Picker bar is rendered above any actionable state (skipped while
  // checking, never in public mode where the route always returns
  // Original). Disabled during streaming. Styling matches
  // SummaryReader's pickerBar so the empty / loaded state of both tabs
  // looks identical.
  const pickerBar =
    !publicMode && status !== 'checking' ? (
      <div className="mb-4 flex items-center justify-end">
        <LanguagePicker
          value={selectedLanguage}
          onChange={onLanguageChange}
          disabled={status === 'streaming'}
        />
      </div>
    ) : null;

  if (status === 'checking') {
    return (
      <div className="animate-pulse space-y-4 py-4">
        {[100, 80, 95, 70, 85].map((w, i) => (
          <div key={i} className="h-4 rounded bg-muted" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }

  if (status === 'idle') {
    if (publicMode) {
      return (
        <div className="py-8 text-center text-sm text-muted-foreground">No article available.</div>
      );
    }
    if (transcriptStatus === 'unavailable') {
      return (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No transcript is available for this video, so an article can&rsquo;t be generated.
        </div>
      );
    }
    return (
      <div>
        {pickerBar}
        <div className="py-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            Generate a clean, readable article from the transcript.
          </p>
          <button
            onClick={() => handleGenerate()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Generate article
          </button>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    if (publicMode) {
      return (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {errorMessage ?? 'Article is not available.'}
        </div>
      );
    }
    return (
      <div>
        {pickerBar}
        <div className="py-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">{errorMessage}</p>
          <button
            onClick={() => handleGenerate()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Regenerate is a dev-only escape hatch — costs tokens, can produce
  // different output every time, not a user-facing affordance. Gated
  // on non-prod AND non-public so it never renders on app.readtube
  // deploys or public-share pages.
  const showRegenerate = !isProduction() && !publicMode;

  const trimmedContent = content.trim();
  const hasExportableContent = trimmedContent.length > 0;
  const isStreaming = status === 'streaming';

  return (
    <div ref={followBottomRef}>
      <div className="mb-4 flex items-center justify-end gap-3">
        {!publicMode && (
          <LanguagePicker
            value={selectedLanguage}
            onChange={onLanguageChange}
            disabled={isStreaming}
          />
        )}
        {showRegenerate && (
          <RegenerateButton
            onClick={() => handleGenerate({ force: true })}
            disabled={isStreaming}
          />
        )}
        <ExportMarkdownButtons
          getContent={() => trimmedContent}
          filename={`${videoTitle}-article`}
          disabled={!hasExportableContent || isStreaming}
        />
      </div>
      {isStreaming && sectionsTotal != null ? (
        <StreamingArticleBody
          sectionsTotal={sectionsTotal}
          sections={sectionStates}
          consolidatedHeadings={consolidatedHeadings}
        />
      ) : (
        <ArticleMarkdown hasLatex={hasLatex} enableHeadingIds>
          {content}
        </ArticleMarkdown>
      )}
      {status === 'streaming' && (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          {sectionsTotal != null
            ? reducing
              ? `Polishing outline (${sectionsReady} of ${sectionsTotal} sections ready)…`
              : `Generating long article — ${sectionsReady} of ${sectionsTotal} sections ready…`
            : 'Generating…'}
        </div>
      )}
      <FloatingToc items={tocItems} variant="headings" />
    </div>
  );
}
