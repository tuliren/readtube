'use client';

import { ChevronDown, Languages, NotebookPen } from 'lucide-react';
import { useState } from 'react';

import PreviewFrame from './PreviewFrame';
import {
  DEMO_ARTICLE,
  DEMO_LANGUAGES,
  DEMO_NOTES,
  DEMO_SUMMARY,
  DEMO_TRANSCRIPT,
  DEMO_VIDEO,
  type DemoNote,
  type LanguageCode,
} from './fixtures';

type Tab = 'summary' | 'article' | 'transcript';

interface Props {
  defaultTab?: Tab;
  defaultLanguage?: LanguageCode;
  showLanguagePicker?: boolean;
  showNotesPanel?: boolean;
}

function TabStrip({
  activeTab,
  onChange,
  showLanguagePicker,
  language,
  onLanguageChange,
}: {
  activeTab: Tab;
  onChange: (next: Tab) => void;
  showLanguagePicker: boolean;
  language: LanguageCode;
  onLanguageChange: (next: LanguageCode) => void;
}) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'article', label: 'Article' },
    { key: 'transcript', label: 'Transcript' },
  ];
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-2 dark:border-slate-700">
      <div className="flex items-center">
        {tabs.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={`relative px-2 py-1.5 text-[10px] font-medium transition-colors ${
                active
                  ? 'text-indigo-600 dark:text-indigo-300'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
              {active && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-full bg-indigo-500" />
              )}
            </button>
          );
        })}
      </div>
      {showLanguagePicker && (
        <div className="relative inline-flex items-center">
          <Languages className="pointer-events-none absolute left-1.5 h-3 w-3 text-slate-400 dark:text-slate-500" />
          <select
            aria-label="Language"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as LanguageCode)}
            className="appearance-none rounded-md border border-slate-200 bg-white py-0.5 pr-5 pl-5 text-[10px] leading-none text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600"
          >
            {DEMO_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeName}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 h-3 w-3 text-slate-400 dark:text-slate-500" />
        </div>
      )}
    </div>
  );
}

function SummaryTab({ language }: { language: LanguageCode }) {
  const summary = DEMO_SUMMARY[language];
  return (
    <div className="space-y-2">
      <h4 className="font-display text-[12px] font-medium leading-snug text-slate-800 dark:text-slate-100">
        {summary.headline}
      </h4>
      <div>
        <div className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
          Short
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
          {summary.short}
        </p>
      </div>
      <div>
        <div className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
          Full
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
          {summary.full}
        </p>
      </div>
    </div>
  );
}

function ArticleTab({ language }: { language: LanguageCode }) {
  // We render the demo article as plain blocks rather than going through
  // the production `ArticleMarkdown` (which pulls in remark/rehype + KaTeX)
  // — the marketing demo doesn't need math, link rewriting, or heading
  // ids, and importing that here would balloon the homepage bundle. The
  // demo content uses a small whitelist: `## ` headings, `- ` lists, and
  // paragraph text.
  const markdown = DEMO_ARTICLE[language];
  const blocks: { type: 'h2' | 'p' | 'ul'; content: string | string[] }[] = [];
  let listBuffer: string[] = [];
  for (const line of markdown.split('\n')) {
    if (line.startsWith('- ')) {
      listBuffer.push(line.slice(2));
      continue;
    }
    if (listBuffer.length > 0) {
      blocks.push({ type: 'ul', content: listBuffer });
      listBuffer = [];
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', content: line.slice(3) });
    } else if (line.trim().length > 0) {
      blocks.push({ type: 'p', content: line });
    }
  }
  if (listBuffer.length > 0) {
    blocks.push({ type: 'ul', content: listBuffer });
  }

  return (
    <div className="space-y-2 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
      {blocks.map((block, i) => {
        if (block.type === 'h2') {
          return (
            <h5
              key={i}
              className="font-display text-[11px] font-semibold text-slate-800 dark:text-slate-100"
            >
              {block.content as string}
            </h5>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul
              key={i}
              className="ml-3 list-disc space-y-0.5 marker:text-slate-400 dark:marker:text-slate-500"
            >
              {(block.content as string[]).map((li, j) => (
                <li key={j}>{li}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{block.content as string}</p>;
      })}
    </div>
  );
}

function TranscriptTab() {
  return (
    <div className="space-y-1 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
      {DEMO_TRANSCRIPT.map((line) => (
        <p key={line.time}>
          <span className="mr-1.5 font-mono text-[9px] text-slate-400 dark:text-slate-500">
            [{line.time}]
          </span>
          {line.text}
        </p>
      ))}
    </div>
  );
}

function NotesPanel({
  notes,
  draft,
  onDraftChange,
  onSave,
}: {
  notes: DemoNote[];
  draft: string;
  onDraftChange: (next: string) => void;
  onSave: () => void;
}) {
  return (
    <aside className="flex w-32 shrink-0 flex-col border-l border-slate-200 bg-amber-50/40 px-2 py-2 dark:border-slate-700 dark:bg-amber-900/10">
      <div className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
        <NotebookPen className="h-2.5 w-2.5" />
        Notes
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {notes.map((note) => (
          <div
            key={note.id}
            className="rounded-md bg-yellow-100/80 p-1.5 ring-1 ring-yellow-200/80 dark:bg-yellow-900/30 dark:ring-yellow-700/50"
          >
            <span className="rounded bg-yellow-200 px-1 py-0 font-mono text-[8px] font-medium text-yellow-800 dark:bg-yellow-800/60 dark:text-yellow-200">
              {note.time}
            </span>
            <p className="mt-1 text-[9px] leading-snug text-yellow-900/80 dark:text-yellow-100/80">
              {note.text}
            </p>
          </div>
        ))}
      </div>
      <textarea
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        placeholder="Add a note…"
        rows={2}
        className="mt-1.5 w-full resize-none rounded border border-amber-200 bg-white px-1 py-0.5 text-[9px] leading-snug text-slate-700 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none dark:border-amber-800/60 dark:bg-slate-800 dark:text-slate-200"
      />
      <button
        type="button"
        onClick={onSave}
        disabled={draft.trim().length === 0}
        className="mt-1 self-end rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Save
      </button>
    </aside>
  );
}

export default function ReaderPreview({
  defaultTab = 'summary',
  defaultLanguage = 'en',
  showLanguagePicker = false,
  showNotesPanel = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);
  const [notes, setNotes] = useState<DemoNote[]>(DEMO_NOTES);
  const [draft, setDraft] = useState('');

  function handleSaveNote() {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      return;
    }
    const next: DemoNote = {
      id: `n${notes.length + 1}-${Date.now()}`,
      time: '2:04',
      text: trimmed,
    };
    setNotes((prev) => [...prev, next]);
    setDraft('');
  }

  return (
    <PreviewFrame noPadding>
      <div className="flex h-full">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Metadata row */}
          <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
            <h4 className="truncate font-display text-[11px] font-semibold leading-snug text-slate-800 dark:text-slate-100">
              {DEMO_VIDEO.title}
            </h4>
            <div className="mt-0.5 text-[9px] text-slate-400 dark:text-slate-500">
              {DEMO_VIDEO.channelName} · {DEMO_VIDEO.publishedLabel} · {DEMO_VIDEO.durationLabel}
            </div>
          </div>
          <TabStrip
            activeTab={activeTab}
            onChange={setActiveTab}
            showLanguagePicker={showLanguagePicker}
            language={language}
            onLanguageChange={setLanguage}
          />
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {activeTab === 'summary' && <SummaryTab language={language} />}
            {activeTab === 'article' && <ArticleTab language={language} />}
            {activeTab === 'transcript' && <TranscriptTab />}
          </div>
        </div>
        {showNotesPanel && (
          <NotesPanel
            notes={notes}
            draft={draft}
            onDraftChange={setDraft}
            onSave={handleSaveNote}
          />
        )}
      </div>
    </PreviewFrame>
  );
}
