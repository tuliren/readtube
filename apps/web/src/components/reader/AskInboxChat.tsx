'use client';

import { Send, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

interface Citation {
  videoId: string;
  title: string;
  channelName: string;
}

interface Turn {
  question: string;
  answer: string;
  citations: Citation[];
  loading: boolean;
}

/**
 * Minimal chat UI for Ask-my-inbox. Each turn captures the user's
 * question, streams the model's response into the transcript, and
 * renders the cited videos as links back into the reader.
 *
 * The streaming client is intentionally low-level: we read the body as
 * a ReadableStream and decode into UTF-8 chunks. No useChat() hook or
 * extra SDK surface — this keeps the dependency surface small and the
 * control flow explicit.
 */
export default function AskInboxChat() {
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  // Guard against concurrent submissions while a stream is in
  // flight. Without this the user could fire a second question
  // before the first finishes streaming, and both stream loops
  // would race to update `turns[prev.length - 1]` — corrupting
  // each other's answer cell.
  const [streaming, setStreaming] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (streaming) {
      return;
    }
    const question = input.trim();
    if (question.length === 0) {
      return;
    }
    setInput('');
    setStreaming(true);

    const turn: Turn = { question, answer: '', citations: [], loading: true };
    setTurns((prev) => [...prev, turn]);

    try {
      const res = await fetch('/api/inbox/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      const citationsHeader = res.headers.get('X-Citations');
      const citations: Citation[] = citationsHeader != null ? JSON.parse(citationsHeader) : [];

      if (!res.ok || res.body == null) {
        let error = 'Failed to get an answer';
        try {
          const body = await res.json();
          if (body?.error != null) {
            error = String(body.error);
          }
        } catch {
          // ignore
        }
        setTurns((prev) =>
          prev.map((t, i) =>
            i === prev.length - 1 ? { ...t, answer: error, citations: [], loading: false } : t
          )
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const snapshot = buffer;
        setTurns((prev) =>
          prev.map((t, i) => (i === prev.length - 1 ? { ...t, answer: snapshot, citations } : t))
        );
      }
      setTurns((prev) =>
        prev.map((t, i) => (i === prev.length - 1 ? { ...t, loading: false } : t))
      );
    } finally {
      // Always release the streaming guard, even if the fetch threw
      // mid-stream — otherwise an error during the read loop would
      // permanently lock the input.
      setStreaming(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-white px-6 py-3">
        <Sparkles className="h-4 w-4 text-purple-500" />
        <h1 className="text-sm font-semibold text-gray-900">Ask your inbox</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          {turns.length === 0 && (
            <div className="rounded-md border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
              Ask a question about the videos in your inbox. Answers are grounded on the top-6
              semantically similar videos.
              <br />
              Try: &ldquo;What&rsquo;s the latest on AI agents?&rdquo; or &ldquo;Summarize what I
              saved about Rust.&rdquo;
            </div>
          )}

          {turns.map((turn, idx) => (
            <div key={idx} className="flex flex-col gap-3">
              <div className="flex justify-end">
                <div className="max-w-md rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">
                  {turn.question}
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800">
                {turn.answer.length === 0 && turn.loading ? (
                  <span className="text-gray-400">Thinking…</span>
                ) : (
                  <p className="whitespace-pre-wrap">{turn.answer}</p>
                )}
                {turn.citations.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1 border-t border-gray-100 pt-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Sources
                    </p>
                    <ol className="flex flex-col gap-1 text-xs">
                      {turn.citations.map((c, i) => (
                        <li key={c.videoId}>
                          <Link
                            href={`/inbox/${c.videoId}`}
                            className="text-blue-600 hover:underline"
                          >
                            [{i + 1}] {c.title}
                          </Link>
                          <span className="text-gray-400"> · {c.channelName}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="border-t border-gray-100 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              streaming ? 'Waiting for the previous answer…' : 'Ask anything about your inbox…'
            }
            disabled={streaming}
            className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
          />
          <Button type="submit" size="sm" disabled={streaming || input.trim().length === 0}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
