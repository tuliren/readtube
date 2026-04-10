'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

interface Props {
  videoDbId: string;
}

type Status = 'idle' | 'streaming' | 'done' | 'error';

export default function ArticleReader({ videoDbId }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [markdown, setMarkdown] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGenerate() {
    setStatus('streaming');
    setMarkdown('');
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/videos/${videoDbId}/article`, { method: 'POST' });

      if (!res.ok) {
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
    } catch (err) {
      console.error('[ArticleReader] stream error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to generate article.');
      setStatus('error');
    }
  }

  if (status === 'idle') {
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
      <article
        className="prose prose-gray max-w-none"
        style={{ fontFamily: 'Georgia, serif', fontSize: '17px', lineHeight: '1.8' }}
      >
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
