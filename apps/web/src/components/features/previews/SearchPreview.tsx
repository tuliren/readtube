import { Search } from 'lucide-react';

import PreviewFrame from './PreviewFrame';

const RESULTS = [
  {
    initial: 'A',
    tint: 'bg-amber-100 text-amber-700',
    title: 'Designing a morning block that survives',
    snippet: 'The first ninety minutes set the tone for everything that comes after...',
  },
  {
    initial: 'T',
    tint: 'bg-rose-100 text-rose-700',
    title: 'What Slack does to your working memory',
    snippet: 'Every ping costs attention, even when you manage to ignore it...',
  },
  {
    initial: 'C',
    tint: 'bg-sky-100 text-sky-700',
    title: 'The compound interest of deep work',
    snippet: 'Small gains in focus stack across months into a genuine advantage...',
  },
];

export default function SearchPreview() {
  return (
    <PreviewFrame>
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200">
          <Search className="h-4 w-4 text-slate-400" />
          <div className="flex-1 text-sm text-slate-700">how to protect focus time</div>
          <div className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
            ⌘K
          </div>
        </div>
        <div className="flex-1 space-y-2">
          {RESULTS.map((result) => (
            <div
              key={result.initial}
              className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100"
            >
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${result.tint}`}
              >
                {result.initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium text-slate-700">
                  {result.title}
                </div>
                <div className="truncate text-[10px] text-slate-500">{result.snippet}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PreviewFrame>
  );
}
