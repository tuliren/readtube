'use client';

import { useState } from 'react';

import PreviewFrame from './PreviewFrame';
import { INBOX_ROWS, type InboxRow } from './fixtures';

type FilterKey = 'inbox' | 'unread' | 'starred' | 'saved' | 'archived';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'unread', label: 'Unread' },
  { key: 'starred', label: 'Starred' },
  { key: 'saved', label: 'Read Later' },
  { key: 'archived', label: 'Archived' },
];

function applyFilter(rows: InboxRow[], filter: FilterKey): InboxRow[] {
  switch (filter) {
    case 'inbox':
      return rows.filter((r) => !r.isArchived);
    case 'unread':
      return rows.filter((r) => r.isUnread && !r.isArchived);
    case 'starred':
      return rows.filter((r) => r.isStarred);
    case 'saved':
      return rows.filter((r) => r.isSaved);
    case 'archived':
      return rows.filter((r) => r.isArchived);
  }
}

function ArtifactDot({ label, present }: { label: string; present: boolean }) {
  return (
    <span
      className={`inline-flex h-3 w-3 items-center justify-center rounded-full border text-[7px] font-semibold leading-none ${
        present
          ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
          : 'border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
      }`}
    >
      {label}
    </span>
  );
}

export default function InboxPreview() {
  const [filter, setFilter] = useState<FilterKey>('inbox');
  const visible = applyFilter(INBOX_ROWS, filter);
  const unreadCount = INBOX_ROWS.filter((r) => r.isUnread && !r.isArchived).length;

  return (
    <PreviewFrame noPadding>
      <div className="flex h-full flex-col">
        {/* Title row */}
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              Inbox
            </span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-blue-100 px-1.5 py-0 text-[9px] font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                {unreadCount}
              </span>
            )}
          </div>
          <span className="text-[9px] text-slate-400 dark:text-slate-500">
            {visible.length} {visible.length === 1 ? 'video' : 'videos'}
          </span>
        </div>
        {/* Filter pills */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 px-3 py-1.5 dark:border-slate-700">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        {/* Rows */}
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {visible.length === 0 ? (
            <li className="px-3 py-6 text-center text-[10px] text-slate-400 dark:text-slate-500">
              No videos in this view.
            </li>
          ) : (
            visible.map((row) => (
              <li key={row.id} className="flex items-start gap-2 px-3 py-2">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                    row.isUnread ? 'bg-blue-600' : 'bg-transparent'
                  }`}
                />
                <span
                  className={`flex h-7 w-10 shrink-0 items-center justify-center rounded text-[10px] font-semibold ${row.channelTint}`}
                  aria-hidden
                >
                  {row.channelInitial}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-[11px] leading-snug ${
                      row.isUnread
                        ? 'font-semibold text-slate-800 dark:text-slate-100'
                        : 'font-normal text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {row.title}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-slate-400 dark:text-slate-500">
                    <span className="truncate">
                      {row.channelName} · {row.publishedLabel} · {row.durationLabel}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <ArtifactDot label="S" present={row.hasSummary} />
                      <ArtifactDot label="A" present={row.hasArticle} />
                      <ArtifactDot label="T" present={row.hasTranscript} />
                    </span>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </PreviewFrame>
  );
}
