'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

import { countWords } from '@/lib/format/wordCount';

import type { TranscriptStatus } from './VideoReader';

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
}: Props) {
  const apiBase = publicMode ? '/api/public/videos' : '/api/videos';
  const [status, setStatus] = useState<Status>('checking');
  const [markdown, setMarkdown] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('checking');
    setMarkdown('');
    setErrorMessage(null);

    fetch(`${apiBase}/${videoDbId}/article?style=${STYLE}`)
      .then(async (res) => {
        if (cancelled) {
          return;
        }
        if (res.status === 404) {
          setStatus('idle');
          return;
        }
        if (!res.ok) {
          setStatus('idle');
          return;
        }
        const data = (await res.json()) as { content: string };
        setMarkdown(data.content);
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
  }, [videoDbId, onArticleAvailable, apiBase]);

  // Stream the article word count up to VideoReader so the Article
  // tab header can render the reading-time badge. Fires on every
  // markdown change, including incremental streaming updates.
  useEffect(() => {
    onArticleWordsChange(countWords(markdown));
  }, [markdown, onArticleWordsChange]);

  async function handleGenerate() {
    setStatus('streaming');
    setMarkdown('');
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/videos/${videoDbId}/article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: STYLE }),
      });

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

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        setMarkdown(buffer);
      }

      if (!buffer.trim()) {
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
      <div className="py-8 text-center">
        <p className="mb-4 text-sm text-gray-500">
          Generate a clean, readable article from the transcript.
        </p>
        <button
          onClick={handleGenerate}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Generate article
        </button>
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
      <div className="py-8 text-center">
        <p className="mb-4 text-sm text-gray-400">{errorMessage}</p>
        <button
          onClick={handleGenerate}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div>
      <article className="prose prose-gray max-w-none font-sans text-[17px] leading-[1.8]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[
            rehypeSanitize,
            [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
          ]}
        >
          {markdown}
        </ReactMarkdown>
      </article>
      {status === 'streaming' && (
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          Generating…
        </div>
      )}
    </div>
  );
}
