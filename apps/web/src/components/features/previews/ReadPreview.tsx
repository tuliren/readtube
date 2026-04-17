import PreviewFrame from './PreviewFrame';

export default function ReadPreview() {
  return (
    <PreviewFrame>
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-slate-400">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Transcript
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-2 w-11/12 rounded bg-slate-200" />
          <div className="h-2 w-full rounded bg-slate-200" />
          <div className="h-2 w-10/12 rounded bg-slate-200" />
          <div className="h-2 w-9/12 rounded bg-slate-200" />
          <div className="h-2 w-11/12 rounded bg-slate-200" />
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-indigo-100">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600">
            Summary
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="h-2 w-full rounded bg-slate-200" />
            <div className="h-2 w-10/12 rounded bg-slate-200" />
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}
