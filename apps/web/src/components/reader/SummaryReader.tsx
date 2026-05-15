'use client';

import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { countWords } from '@/lib/format/wordCount';
import { parseMarkdownDocument } from '@/lib/markdownFrontmatter';
import { consumeNdjsonStream } from '@/lib/reader/consumeNdjsonStream';
import { buildScheduledMessage, parseScheduledResponse } from '@/lib/reader/scheduledVideoToast';
import { useFollowBottom } from '@/lib/reader/useFollowBottom';
import { isProduction } from '@/lib/vercelEnv';

import ArticleMarkdown from './ArticleMarkdown';
import ExportMarkdownButtons from './ExportMarkdownButtons';
import LanguagePicker, { languageQueryFragment } from './LanguagePicker';
import type { TranscriptStatus } from './VideoReader';

type HasLatexByField = Partial<Record<'short' | 'full', boolean>>;

interface Props {
  videoDbId: string;
  /** Used as the slug for the exported markdown file's name. */
  videoTitle: string;
  /** Shared transcript availability lifted from VideoReader. The
   *  three reader tabs share one source of truth so that auto-
   *  fetch results in the Summary tab also disable Generate in
   *  Article and switch the Transcript tab to its unavailable
   *  state without an extra round-trip. */
  transcriptStatus: TranscriptStatus;
  onTranscriptStatusChange: (next: TranscriptStatus) => void;
  /** Reports per-language summary availability up to VideoReader.
   *  Fires once per fetch resolution: `available=true` on the GET
   *  cache hit and after a successful generation, `available=false`
   *  on the 404 / fetch-error path. VideoReader uses this both to
   *  flip the Summary tab dot blue (any language available) and to
   *  gate the Share link on whether the *currently selected*
   *  language has content. */
  onSummaryAvailability: (language: string | null, available: boolean) => void;
  /** Reports the total word count (headline + short + full) up to
   *  VideoReader so the Summary tab header can render the reading
   *  time badge. Fires on every summary state change, so the badge
   *  updates live as content streams in. */
  onSummaryWordsChange: (words: number) => void;
  /** Reports whether a generation is currently writing into this
   *  tab. VideoReader uses it to swap the reading-time badge for a
   *  spinner — the badge would tick up dishonestly as partial
   *  deltas land otherwise. Covers POST-driven `'generating'` and
   *  GET-tap-in (where the mount fetch sees NDJSON and switches
   *  the same status). */
  onSummaryGeneratingChange: (generating: boolean) => void;
  /** When true, fetch from the unauthenticated public endpoint and
   *  render a read-only view — no generate / regenerate affordances. */
  publicMode?: boolean;
  /** Controlled picker selection lifted to VideoReader so Summary and
   *  Article stay in sync and the Share link can append the same
   *  `?language=`. null = Original. */
  selectedLanguage: string | null;
  onLanguageChange: (next: string | null) => void;
}

type SummaryField = 'headline' | 'short' | 'full';

const ALL_FIELDS: readonly SummaryField[] = ['headline', 'short', 'full'] as const;

interface SummaryData {
  headline: string | null;
  short: string | null;
  full: string | null;
}

type Status = 'checking' | 'idle' | 'generating' | 'done' | 'error';

function SummarySkeleton() {
  return (
    <div className="animate-pulse space-y-4 py-4">
      {[100, 80, 95, 70, 85].map((w, i) => (
        <div key={i} className="h-4 rounded bg-muted" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function WordCountLabel({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }
  return (
    <span className="text-xs font-normal text-muted-foreground">
      ({count} {count === 1 ? 'word' : 'words'})
    </span>
  );
}

function RegenerateButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="Regenerate"
      className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:hover:text-muted-foreground"
    >
      <ArrowPathIcon className="h-3.5 w-3.5" />
      Regenerate
    </button>
  );
}

export default function SummaryReader({
  videoDbId,
  videoTitle,
  transcriptStatus,
  onTranscriptStatusChange,
  onSummaryAvailability,
  onSummaryWordsChange,
  onSummaryGeneratingChange,
  publicMode = false,
  selectedLanguage,
  onLanguageChange,
}: Props) {
  const apiBase = publicMode ? '/api/public/videos' : '/api/videos';
  const [status, setStatus] = useState<Status>('checking');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [hasLatexByField, setHasLatexByField] = useState<HasLatexByField>({});
  const [regeneratingFields, setRegeneratingFields] = useState<SummaryField[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-scroll the reader to the bottom while summary fields stream
  // in, unless the user has scrolled away. See ArticleReader for the
  // longer note.
  const followBottomRef = useFollowBottom(status === 'generating', [
    summary?.headline,
    summary?.short,
    summary?.full,
  ]);

  useEffect(() => {
    let cancelled = false;
    setStatus('checking');
    setSummary(null);
    setHasLatexByField({});
    setErrorMessage(null);
    setRegeneratingFields([]);

    const fragment = languageQueryFragment(selectedLanguage);
    const url = `${apiBase}/${videoDbId}/summary?${fragment}`;

    (async () => {
      let res: Response;
      try {
        res = await fetch(url);
      } catch {
        if (!cancelled) {
          setStatus('idle');
          onSummaryAvailability(selectedLanguage, false);
        }
        return;
      }
      if (cancelled) {
        return;
      }
      if (res.status === 404 || !res.ok) {
        setStatus('idle');
        onSummaryAvailability(selectedLanguage, false);
        return;
      }

      // The server tells us whether to expect a cached JSON row or an
      // in-flight workflow stream by the Content-Type. NDJSON means
      // there's an active workflow — we tap into its readable so the
      // user sees live progress (and a refresh mid-generation lands
      // on the live stream instead of the Generate button).
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/x-ndjson')) {
        if (res.body == null) {
          setErrorMessage('No response body from server.');
          setStatus('error');
          return;
        }

        // Switch into the same streaming UX that handleGenerate uses
        // — empty fields with skeletons until deltas arrive. All three
        // fields are considered "regenerating" since the active run
        // is a full-generate (per-field regenerates aren't registered
        // in the run registry).
        setStatus('generating');
        setRegeneratingFields([...ALL_FIELDS]);
        setSummary({ headline: '', short: '', full: '' });

        const accumulated: Record<SummaryField, string> = {
          headline: '',
          short: '',
          full: '',
        };
        let sawDone = false;
        let streamError: string | null = null;

        await consumeNdjsonStream(res.body, (event) => {
          if (typeof event !== 'object' || event === null) {
            return;
          }
          const e = event as {
            field?: SummaryField;
            delta?: string;
            hasLatex?: boolean;
            error?: string;
            type?: string;
          };
          if (e.type === 'done') {
            sawDone = true;
            return;
          }
          if (e.field != null && typeof e.delta === 'string') {
            accumulated[e.field] += e.delta;
            const fieldName = e.field;
            const fieldValue = accumulated[fieldName];
            setSummary((prev) => ({
              headline: prev?.headline ?? null,
              short: prev?.short ?? null,
              full: prev?.full ?? null,
              [fieldName]: fieldValue,
            }));
          } else if (e.field != null && typeof e.hasLatex === 'boolean') {
            const fieldName = e.field;
            if (fieldName === 'short' || fieldName === 'full') {
              const flag = e.hasLatex;
              setHasLatexByField((prev) => ({ ...prev, [fieldName]: flag }));
            }
          } else if (typeof e.error === 'string') {
            streamError = e.error;
          }
        });

        if (cancelled) {
          return;
        }
        if (streamError != null) {
          setErrorMessage(streamError);
          setStatus('error');
          setRegeneratingFields([]);
          return;
        }
        if (!sawDone) {
          setErrorMessage(
            'Generation ended unexpectedly. Please refresh in a moment, or try again.'
          );
          setStatus('error');
          setRegeneratingFields([]);
          return;
        }
        const anyContent = ALL_FIELDS.some((f) => accumulated[f].trim().length > 0);
        if (!anyContent) {
          setErrorMessage('No content was generated. Please try again.');
          setStatus('error');
          setRegeneratingFields([]);
          return;
        }
        setStatus('done');
        setRegeneratingFields([]);
        onSummaryAvailability(selectedLanguage, true);
        return;
      }

      // application/json — cached Summary row.
      const data = (await res.json()) as SummaryData;
      if (cancelled) {
        return;
      }
      // Stored short/full rows carry a YAML frontmatter with
      // hasLatex. Peel it off so the renderer sees plain markdown.
      const shortDoc = parseMarkdownDocument(data.short ?? '');
      const fullDoc = parseMarkdownDocument(data.full ?? '');
      setSummary({
        headline: data.headline,
        short: shortDoc.frontmatterPending ? (data.short ?? null) : shortDoc.content,
        full: fullDoc.frontmatterPending ? (data.full ?? null) : fullDoc.content,
      });
      setHasLatexByField({
        short: shortDoc.properties.hasLatex === true,
        full: fullDoc.properties.hasLatex === true,
      });
      setStatus('done');
      // Cache hit — flip the parent's Summary tab dot to blue
      // immediately, regardless of whether the user is currently
      // looking at this tab. Also marks this language as available
      // so VideoReader can show the Share button.
      onSummaryAvailability(selectedLanguage, true);
    })();

    return () => {
      cancelled = true;
    };
  }, [videoDbId, onSummaryAvailability, apiBase, selectedLanguage]);

  // Stream the total word count up to VideoReader so the Summary tab
  // header can render the "X min" reading-time badge. summary.short
  // and summary.full are already frontmatter-stripped (GET path
  // parses on receipt, POST path stores clean structured-output
  // content), so counting is direct.
  useEffect(() => {
    if (summary == null) {
      onSummaryWordsChange(0);
      return;
    }
    const total =
      countWords(summary.headline) + countWords(summary.short) + countWords(summary.full);
    onSummaryWordsChange(total);
  }, [summary, onSummaryWordsChange]);

  // Mirror the local generating status up to VideoReader so the tab
  // header can swap the (mid-stream-misleading) reading-time badge
  // for a spinner. `'generating'` covers both the POST-driven path
  // and the GET-tap-in path that flips into the same status when
  // the mount fetch sees NDJSON.
  useEffect(() => {
    onSummaryGeneratingChange(status === 'generating');
  }, [status, onSummaryGeneratingChange]);

  async function handleGenerate(targetFields?: SummaryField[]) {
    const fields = targetFields ?? [...ALL_FIELDS];
    setStatus('generating');
    setRegeneratingFields(fields);
    setErrorMessage(null);

    // Clear only the fields being regenerated; keep the others visible.
    setSummary((prev) => {
      const base: SummaryData = prev ?? { headline: null, short: null, full: null };
      const next = { ...base };
      for (const f of fields) {
        next[f] = '';
      }
      return next;
    });
    // Drop the stale hasLatex flags too — otherwise the old flag
    // rides along until the server emits a new {field, hasLatex}
    // event, briefly rendering the fresh content with the prior
    // run's remark-math configuration.
    setHasLatexByField((prev) => {
      const next = { ...prev };
      for (const f of fields) {
        if (f === 'short' || f === 'full') {
          delete next[f];
        }
      }
      return next;
    });

    try {
      const fragment = languageQueryFragment(selectedLanguage);
      const res = await fetch(`/api/videos/${videoDbId}/summary${fragment ? `?${fragment}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });

      if (!res.ok) {
        // 410 from the server means ensureTranscript flagged this
        // video as transcript-unavailable. Flip the shared status so
        // Article and Transcript tabs immediately render their
        // unavailable state too — no extra fetches needed.
        if (res.status === 410) {
          onTranscriptStatusChange('unavailable');
          setErrorMessage('Transcript unavailable for this video.');
          setStatus('error');
          setRegeneratingFields([]);
          return;
        }
        // 425 Too Early — scheduled premiere that hasn't aired yet.
        // Toast a warning and reset to idle so the user can retry
        // after the air time. Don't broadcast unavailable: the
        // transcript will exist once the video airs.
        if (res.status === 425) {
          const body = await parseScheduledResponse(res);
          const message = buildScheduledMessage(body?.scheduledStartTime ?? null);
          toast.warning(message);
          setStatus('idle');
          setRegeneratingFields([]);
          setSummary(null);
          return;
        }
        // 503 means the upstream transcript provider blipped
        // (network error / 429 / 5xx). Surface a retry-friendly
        // error in THIS tab only — do NOT broadcast unavailable,
        // because doing so would lock Article and Transcript out
        // for the rest of the session even though the next click
        // would probably succeed.
        if (res.status === 503) {
          const body = await res
            .json()
            .catch(() => ({ error: 'Transcript fetch failed temporarily — please try again.' }));
          setErrorMessage(body.error ?? 'Transcript fetch failed temporarily — please try again.');
          setStatus('error');
          setRegeneratingFields([]);
          return;
        }
        const body = await res.json().catch(() => ({ error: 'Failed to generate summary.' }));
        setErrorMessage(body.error ?? 'Failed to generate summary.');
        setStatus('error');
        setRegeneratingFields([]);
        return;
      }

      if (!res.body) {
        setErrorMessage('No response body from server.');
        setStatus('error');
        setRegeneratingFields([]);
        return;
      }

      // Reaching this point means the server's ensureTranscript call
      // already succeeded (otherwise it would have returned 410
      // before any stream body) — the transcript is now cached.
      // Broadcast 'present' so the Transcript tab loads it
      // automatically the moment the user switches over, instead of
      // still showing the Fetch button.
      onTranscriptStatusChange('present');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const accumulated: Record<SummaryField, string> = { headline: '', short: '', full: '' };
      let buffer = '';
      let streamError: string | null = null;
      let sawDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }
          let event: {
            field?: SummaryField;
            delta?: string;
            hasLatex?: boolean;
            error?: string;
            type?: string;
          };
          try {
            event = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (event.type === 'done') {
            sawDone = true;
            continue;
          }
          if (event.field && typeof event.delta === 'string') {
            accumulated[event.field] += event.delta;
            const fieldName = event.field;
            const fieldValue = accumulated[event.field];
            setSummary((prev) => ({
              headline: prev?.headline ?? null,
              short: prev?.short ?? null,
              full: prev?.full ?? null,
              [fieldName]: fieldValue,
            }));
          } else if (event.field && typeof event.hasLatex === 'boolean') {
            const fieldName = event.field;
            const flag = event.hasLatex;
            if (fieldName === 'short' || fieldName === 'full') {
              setHasLatexByField((prev) => ({ ...prev, [fieldName]: flag }));
            }
          } else if (typeof event.error === 'string') {
            // Both per-field errors (`{field, error}`) and top-level
            // errors (`{error}` from a workflow generation/persist
            // failure) abort the stream with the same UX. Catch both
            // here so a top-level error never silently falls through
            // to the "no content generated" branch.
            streamError = event.error;
          }
        }
      }

      if (streamError) {
        setErrorMessage(streamError);
        setStatus('error');
        setRegeneratingFields([]);
        return;
      }
      if (!sawDone) {
        // See ArticleReader for the rationale — stream closed without
        // an explicit terminator, don't trust accumulated content.
        setErrorMessage('Generation ended unexpectedly. Please refresh in a moment, or try again.');
        setStatus('error');
        setRegeneratingFields([]);
        return;
      }

      const anyContent = fields.some((f) => accumulated[f].trim().length > 0);
      if (!anyContent) {
        setErrorMessage('No content was generated. Please try again.');
        setStatus('error');
        setRegeneratingFields([]);
        return;
      }

      setStatus('done');
      setRegeneratingFields([]);
      // Tell the parent the Summary tab now has content for the
      // current language so its tab dot can flip from red → blue
      // and the Share button can appear, without waiting for a
      // refresh.
      onSummaryAvailability(selectedLanguage, true);
    } catch (err) {
      console.error('[SummaryReader] generate error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to generate summary.');
      setStatus('error');
      setRegeneratingFields([]);
    }
  }

  // Render the language picker above any actionable state (not while
  // checking, never in public mode where the route always returns
  // Original). Disabled during streaming so the user can't kick off a
  // second generation mid-stream.
  const pickerBar =
    !publicMode && status !== 'checking' ? (
      <div className="mb-4 flex items-center justify-end">
        <LanguagePicker
          value={selectedLanguage}
          onChange={onLanguageChange}
          disabled={status === 'generating'}
        />
      </div>
    ) : null;

  if (status === 'checking') {
    return <SummarySkeleton />;
  }

  if (status === 'idle') {
    if (publicMode) {
      return (
        <div className="py-8 text-center text-sm text-muted-foreground">No summary available.</div>
      );
    }
    // Sticky-unavailable: hide the Generate affordance entirely so the
    // user isn't tempted to click into a guaranteed-failure state. The
    // server already returns 410 for this case but eliminating the
    // button is the kinder UX.
    if (transcriptStatus === 'unavailable') {
      return (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No transcript is available for this video, so a summary can&rsquo;t be generated.
        </div>
      );
    }
    return (
      <div>
        {pickerBar}
        <div className="py-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            Generate a headline, a quick paragraph, and a compact recap of this video.
          </p>
          <button
            onClick={() => handleGenerate()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Generate summary
          </button>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    if (publicMode) {
      return (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {errorMessage ?? 'Summary is not available.'}
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

  if (!summary) {
    return null;
  }

  const isStreaming = status === 'generating';
  const isRegenerating = (field: SummaryField) => regeneratingFields.includes(field);
  // Regenerate is a dev-only escape hatch — costs tokens, can produce
  // worse output than a cached run, and shouldn't be exposed to end
  // users in production.
  const showRegenerate = !isProduction() && !publicMode;

  // summary.short / summary.full are already frontmatter-stripped —
  // GET parses on receipt, POST streams clean structured-output
  // content. hasLatex comes from hasLatexByField, populated by the
  // same two paths.
  const shortContent = summary.short?.trim() ?? '';
  const fullContent = summary.full?.trim() ?? '';
  const shortHasLatex = hasLatexByField.short === true;
  const fullHasLatex = hasLatexByField.full === true;

  // Word counts surfaced next to the multi-sentence section headers
  // so the reader can size up the density before reading. Computed
  // on the rendered text, so a streaming generation increments
  // visibly as new tokens come in. Headline is intentionally
  // excluded — it's a one-sentence newspaper-style title and a
  // word count there is just visual noise.
  const shortWords = countWords(shortContent);
  const fullWords = countWords(fullContent);

  const buildExportMarkdown = () => {
    const parts: string[] = [];
    if (summary.headline != null && summary.headline.trim().length > 0) {
      parts.push(`# ${summary.headline.trim()}`);
    }
    if (shortContent.length > 0) {
      parts.push(`## Short summary\n\n${shortContent}`);
    }
    if (fullContent.length > 0) {
      parts.push(`## Full summary\n\n${fullContent}`);
    }
    return parts.join('\n\n');
  };
  const hasExportableContent =
    (summary.headline != null && summary.headline.trim().length > 0) ||
    shortContent.length > 0 ||
    fullContent.length > 0;

  return (
    <div ref={followBottomRef}>
      <div className="mb-4 flex items-center justify-end gap-3">
        {!publicMode && (
          <LanguagePicker
            value={selectedLanguage}
            onChange={onLanguageChange}
            disabled={status === 'generating'}
          />
        )}
        <ExportMarkdownButtons
          getContent={buildExportMarkdown}
          filename={`${videoTitle}-summary`}
          disabled={!hasExportableContent || isStreaming}
        />
      </div>
      <div className="space-y-8">
        {/* Headline */}
        <div className="flex items-start justify-between gap-4">
          {summary.headline ? (
            <h2 className="flex-1 text-xl leading-snug font-semibold text-foreground">
              {summary.headline}
            </h2>
          ) : isRegenerating('headline') ? (
            <div className="h-6 flex-1 animate-pulse rounded bg-muted" />
          ) : (
            <div className="flex-1 text-sm text-muted-foreground italic">No headline yet.</div>
          )}
          {showRegenerate && !isRegenerating('headline') && (
            <RegenerateButton onClick={() => handleGenerate(['headline'])} disabled={isStreaming} />
          )}
        </div>

        {/* Short */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">
              Quick summary <WordCountLabel count={shortWords} />
            </h3>
            {showRegenerate && !isRegenerating('short') && (
              <RegenerateButton onClick={() => handleGenerate(['short'])} disabled={isStreaming} />
            )}
          </div>
          {shortContent.length > 0 ? (
            <ArticleMarkdown hasLatex={shortHasLatex}>{shortContent}</ArticleMarkdown>
          ) : isRegenerating('short') ? (
            <div className="space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
              <div className="h-4 w-10/12 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">No quick summary yet.</div>
          )}
        </div>

        {/* Full */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">
              Full summary <WordCountLabel count={fullWords} />
            </h3>
            {showRegenerate && !isRegenerating('full') && (
              <RegenerateButton onClick={() => handleGenerate(['full'])} disabled={isStreaming} />
            )}
          </div>
          {fullContent.length > 0 ? (
            <ArticleMarkdown hasLatex={fullHasLatex}>{fullContent}</ArticleMarkdown>
          ) : isRegenerating('full') ? (
            <div className="space-y-2">
              {[100, 95, 90, 85, 75].map((w, i) => (
                <div
                  key={i}
                  className="h-4 animate-pulse rounded bg-muted"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">No full summary yet.</div>
          )}
        </div>

        {isStreaming && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            Generating…
          </div>
        )}
      </div>
    </div>
  );
}
