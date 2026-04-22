'use client';

import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';

import { countWords } from '@/lib/format/wordCount';
import { parseMarkdownDocument } from '@/lib/markdownFrontmatter';
import { isProduction } from '@/lib/vercelEnv';

import ArticleMarkdown from './ArticleMarkdown';
import LanguagePicker, { languageQueryFragment } from './LanguagePicker';
import type { TranscriptStatus } from './VideoReader';

function RegenerateButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="Regenerate article"
      className="inline-flex shrink-0 items-center gap-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50 disabled:hover:text-gray-400"
    >
      <ArrowPathIcon className="h-3.5 w-3.5" />
      Regenerate
    </button>
  );
}

interface Props {
  videoDbId: string;
  /** Shared transcript availability lifted from VideoReader. See the
   *  matching prop on SummaryReader for the longer explanation. */
  transcriptStatus: TranscriptStatus;
  onTranscriptStatusChange: (next: TranscriptStatus) => void;
  /** Tells VideoReader that an Article now exists for this video so
   *  the Article tab dot can flip from red → blue. Fired on the
   *  initial GET cache hit AND after a successful generation. */
  onArticleAvailable: () => void;
  /** Reports the article word count up to VideoReader so the Article
   *  tab header can render the reading time badge. Fires on every
   *  markdown change, so the badge updates live as content streams. */
  onArticleWordsChange: (words: number) => void;
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
  transcriptStatus,
  onTranscriptStatusChange,
  onArticleAvailable,
  onArticleWordsChange,
  publicMode = false,
  selectedLanguage,
  onLanguageChange,
}: Props) {
  const apiBase = publicMode ? '/api/public/videos' : '/api/videos';
  const [status, setStatus] = useState<Status>('checking');
  const [content, setContent] = useState('');
  const [hasLatex, setHasLatex] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('checking');
    setContent('');
    setHasLatex(false);
    setErrorMessage(null);

    const langFragment = languageQueryFragment(selectedLanguage);
    const url = `${apiBase}/${videoDbId}/article?style=${STYLE}&${langFragment}`;
    fetch(url)
      .then(async (res) => {
        if (cancelled) {
          return;
        }
        if (res.status === 404 || !res.ok) {
          setStatus('idle');
          return;
        }
        const data = (await res.json()) as { content: string };
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
        // immediately, regardless of which tab the user is on.
        onArticleAvailable();
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('idle');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [videoDbId, onArticleAvailable, apiBase, selectedLanguage]);

  // Stream the article word count up to VideoReader so the Article
  // tab header can render the reading-time badge. Fires on every
  // content change, including incremental streaming updates.
  useEffect(() => {
    onArticleWordsChange(countWords(content));
  }, [content, onArticleWordsChange]);

  async function handleGenerate(opts: { force?: boolean } = {}) {
    setStatus('streaming');
    setContent('');
    setHasLatex(false);
    setErrorMessage(null);

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

      // Parse NDJSON. Events:
      //   { delta: string }   — appended to content
      //   { hasLatex: bool }  — the LLM-declared flag
      //   { type: 'done' }    — graceful stream end
      //   { error: string }   — mid-stream failure
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let sawError: string | null = null;

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
          if (trimmed.length === 0) {
            continue;
          }
          let event: {
            delta?: unknown;
            hasLatex?: unknown;
            type?: unknown;
            error?: unknown;
          };
          try {
            event = JSON.parse(trimmed);
          } catch {
            continue;
          }
          if (typeof event.delta === 'string') {
            accumulated += event.delta;
            setContent(accumulated);
          }
          if (typeof event.hasLatex === 'boolean') {
            setHasLatex(event.hasLatex);
          }
          if (typeof event.error === 'string') {
            sawError = event.error;
          }
        }
      }

      if (sawError != null) {
        setErrorMessage(sawError);
        setStatus('error');
        return;
      }
      if (!accumulated.trim()) {
        setErrorMessage('No content was generated. Please try again.');
        setStatus('error');
        return;
      }

      setStatus('done');
      // Tell the parent the Article tab now has content so its tab
      // dot can flip from red → blue without waiting for a refresh.
      onArticleAvailable();
    } catch (err) {
      console.error('[ArticleReader] stream error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to generate article.');
      setStatus('error');
    }
  }

  // Picker bar is rendered above any actionable state (skipped while
  // checking, never in public mode where the route always returns
  // Original). Disabled during streaming.
  const pickerBar =
    !publicMode && status !== 'checking' ? (
      <div className="mb-3 flex items-center justify-end gap-3 border-b border-gray-100 pb-2">
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
          <div key={i} className="h-4 rounded bg-gray-200" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }

  if (status === 'idle') {
    if (publicMode) {
      return <div className="py-8 text-center text-sm text-gray-500">No article available.</div>;
    }
    if (transcriptStatus === 'unavailable') {
      return (
        <div className="py-8 text-center text-sm text-gray-500">
          No transcript is available for this video, so an article can&rsquo;t be generated.
        </div>
      );
    }
    return (
      <div>
        {pickerBar}
        <div className="py-8 text-center">
          <p className="mb-4 text-sm text-gray-500">
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
        <div className="py-8 text-center text-sm text-gray-400">
          {errorMessage ?? 'Article is not available.'}
        </div>
      );
    }
    return (
      <div>
        {pickerBar}
        <div className="py-8 text-center">
          <p className="mb-4 text-sm text-gray-400">{errorMessage}</p>
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

  return (
    <div>
      {pickerBar != null ? (
        <div className="mb-3 flex items-center justify-end gap-3 border-b border-gray-100 pb-2">
          <LanguagePicker
            value={selectedLanguage}
            onChange={onLanguageChange}
            disabled={status === 'streaming'}
          />
          {showRegenerate && (
            <RegenerateButton
              onClick={() => handleGenerate({ force: true })}
              disabled={status === 'streaming'}
            />
          )}
        </div>
      ) : (
        showRegenerate && (
          <div className="mb-3 flex items-center justify-end border-b border-gray-100 pb-2">
            <RegenerateButton
              onClick={() => handleGenerate({ force: true })}
              disabled={status === 'streaming'}
            />
          </div>
        )
      )}
      <ArticleMarkdown hasLatex={hasLatex}>{content}</ArticleMarkdown>
      {status === 'streaming' && (
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          Generating…
        </div>
      )}
    </div>
  );
}
