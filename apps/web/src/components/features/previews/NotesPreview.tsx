import PreviewFrame from './PreviewFrame';

export default function NotesPreview() {
  return (
    <PreviewFrame>
      <div className="relative flex h-full flex-col gap-4">
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-slate-400">
          <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
          Highlights
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-2 w-11/12 rounded bg-slate-200" />
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="h-2 w-16 rounded bg-slate-200" />
            <div className="h-2 w-32 rounded bg-yellow-200/80" />
            <div className="h-2 w-20 rounded bg-yellow-200/80" />
            <div className="h-2 w-12 rounded bg-slate-200" />
          </div>
          <div className="h-2 w-10/12 rounded bg-slate-200" />
          <div className="h-2 w-9/12 rounded bg-slate-200" />
          <div className="h-2 w-11/12 rounded bg-slate-200" />
        </div>
        <div className="absolute bottom-2 right-2 w-44 rotate-2 rounded-md bg-yellow-100 p-3 shadow-md ring-1 ring-yellow-200/80">
          <div className="flex items-center justify-between">
            <div className="rounded bg-yellow-200 px-1.5 py-0.5 font-mono text-[10px] font-medium text-yellow-800">
              0:42
            </div>
            <div className="h-1 w-6 rounded bg-yellow-300/80" />
          </div>
          <div className="mt-2 space-y-1">
            <div className="h-1.5 w-full rounded bg-yellow-300/70" />
            <div className="h-1.5 w-10/12 rounded bg-yellow-300/70" />
            <div className="h-1.5 w-8/12 rounded bg-yellow-300/70" />
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}
