'use client';

import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';

interface Props {
  videoDbId: string;
}

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
        <div key={i} className="h-4 rounded bg-gray-200" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

export default function SummaryReader({ videoDbId }: Props) {
  const [status, setStatus] = useState<Status>('checking');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('checking');
    setSummary(null);
    setErrorMessage(null);

    fetch(`/api/videos/${videoDbId}/summary`)
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
        const data = (await res.json()) as SummaryData;
        setSummary(data);
        setStatus('done');
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('idle');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [videoDbId]);

  async function handleGenerate() {
    setStatus('generating');
    setSummary({ headline: '', short: '', full: '' });
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/videos/${videoDbId}/summary`, { method: 'POST' });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed to generate summary.' }));
        setErrorMessage(body.error ?? 'Failed to generate summary.');
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
      const accumulated = { headline: '', short: '', full: '' };
      let buffer = '';
      let fieldError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        // NDJSON — split on newlines, keep any incomplete trailing chunk in buffer.
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }
          let event: {
            field?: 'headline' | 'short' | 'full';
            delta?: string;
            error?: string;
            type?: string;
          };
          try {
            event = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (event.type === 'done') {
            continue;
          }
          if (event.field && typeof event.delta === 'string') {
            accumulated[event.field] += event.delta;
            setSummary({ ...accumulated });
          } else if (event.field && event.error) {
            fieldError = event.error;
          }
        }
      }

      if (fieldError) {
        setErrorMessage(fieldError);
        setStatus('error');
        return;
      }

      if (!accumulated.headline.trim() && !accumulated.short.trim() && !accumulated.full.trim()) {
        setErrorMessage('No content was generated. Please try again.');
        setStatus('error');
        return;
      }

      setSummary(accumulated);
      setStatus('done');
    } catch (err) {
      console.error('[SummaryReader] generate error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to generate summary.');
      setStatus('error');
    }
  }

  if (status === 'checking') {
    return <SummarySkeleton />;
  }

  if (status === 'idle') {
    return (
      <div className="py-8 text-center">
        <p className="mb-4 text-sm text-gray-500">
          Generate a headline, a quick paragraph, and a full recap of this video.
        </p>
        <button
          onClick={handleGenerate}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Generate summary
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

  if (!summary) {
    return null;
  }

  const fullParagraphs = summary.full?.split(/\n\n+/).filter((p) => p.trim().length > 0) ?? [];
  const isStreaming = status === 'generating';

  return (
    <div className="space-y-8">
      {summary.headline ? (
        <h2 className="text-xl leading-snug font-semibold text-gray-900">{summary.headline}</h2>
      ) : isStreaming ? (
        <div className="h-6 w-3/4 animate-pulse rounded bg-gray-200" />
      ) : null}

      <div>
        <h3 className="mb-2 text-xs font-medium tracking-wide text-gray-400 uppercase">
          Quick summary
        </h3>
        {summary.short ? (
          <p
            className="leading-relaxed text-gray-700"
            style={{ fontFamily: 'Georgia, serif', fontSize: '17px', lineHeight: '1.8' }}
          >
            {summary.short}
          </p>
        ) : isStreaming ? (
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-11/12 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-10/12 animate-pulse rounded bg-gray-200" />
          </div>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium tracking-wide text-gray-400 uppercase">
          Full summary
        </h3>
        {fullParagraphs.length > 0 ? (
          <div
            className="space-y-4 leading-relaxed text-gray-800"
            style={{ fontFamily: 'Georgia, serif', fontSize: '17px', lineHeight: '1.8' }}
          >
            {fullParagraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        ) : isStreaming ? (
          <div className="space-y-2">
            {[100, 95, 90, 85, 75].map((w, i) => (
              <div
                key={i}
                className="h-4 animate-pulse rounded bg-gray-200"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
        ) : null}
      </div>

      {isStreaming ? (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          Generating…
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            onClick={handleGenerate}
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
}
