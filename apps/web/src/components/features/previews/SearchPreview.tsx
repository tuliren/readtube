import { Search } from 'lucide-react';

import PreviewFrame from './PreviewFrame';

const RESULTS = [
  { initial: 'A', tint: 'bg-rose-100 text-rose-700', titleWidth: 'w-10/12' },
  { initial: 'L', tint: 'bg-amber-100 text-amber-700', titleWidth: 'w-8/12' },
  { initial: '3', tint: 'bg-sky-100 text-sky-700', titleWidth: 'w-9/12' },
];

export default function SearchPreview() {
  return (
    <PreviewFrame>
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200">
          <Search className="h-4 w-4 text-slate-400" />
          <div className="flex-1 text-sm text-slate-700">explaining transformers</div>
          <div className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
            ⌘K
          </div>
        </div>
        <div className="flex-1 space-y-2.5">
          {RESULTS.map((result, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2.5 ring-1 ring-slate-100"
            >
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${result.tint}`}
              >
                {result.initial}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className={`h-2 rounded bg-slate-300 ${result.titleWidth}`} />
                <div className="h-1.5 w-11/12 rounded bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PreviewFrame>
  );
}
