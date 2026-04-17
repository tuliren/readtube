import PreviewFrame from './PreviewFrame';

export default function ArticlePreview() {
  return (
    <PreviewFrame>
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-slate-400">
            <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            Article
          </div>
          <div className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
            5 min read
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-10/12 rounded bg-slate-300" />
          <div className="h-3 w-7/12 rounded bg-slate-300" />
        </div>
        <div className="flex-1 space-y-4">
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded bg-slate-200" />
            <div className="h-2 w-11/12 rounded bg-slate-200" />
            <div className="h-2 w-10/12 rounded bg-slate-200" />
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-11/12 rounded bg-slate-200" />
            <div className="h-2 w-full rounded bg-slate-200" />
            <div className="h-2 w-9/12 rounded bg-slate-200" />
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-10/12 rounded bg-slate-200" />
            <div className="h-2 w-8/12 rounded bg-slate-200" />
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}
