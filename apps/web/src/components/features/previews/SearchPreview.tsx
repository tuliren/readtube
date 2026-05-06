'use client';

import { Search } from 'lucide-react';
import { useState } from 'react';

import PreviewFrame from './PreviewFrame';
import { SEARCH_RESULTS } from './fixtures';

export default function SearchPreview() {
  const [query, setQuery] = useState('focus');

  const trimmed = query.trim().toLowerCase();
  const visible =
    trimmed.length === 0
      ? SEARCH_RESULTS
      : SEARCH_RESULTS.filter((r) =>
          [r.title, r.snippet, r.keywords].some((field) => field.toLowerCase().includes(trimmed))
        );

  return (
    <PreviewFrame>
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="how to protect focus time"
            aria-label="Search"
            className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200 dark:placeholder:text-slate-500"
          />
          <div className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-300">
            ⌘K
          </div>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="rounded-lg bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-400 dark:bg-slate-800/60 dark:text-slate-500">
              No results — try “focus”, “memory”, or “octopus”.
            </div>
          ) : (
            visible.map((result) => (
              <div
                key={result.initial + result.title}
                className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100 dark:bg-slate-800/60 dark:ring-slate-700"
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${result.tint}`}
                >
                  {result.initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    {result.title}
                  </div>
                  <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                    {result.snippet}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </PreviewFrame>
  );
}
