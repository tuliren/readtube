import PreviewFrame from './PreviewFrame';

export default function ArticlePreview() {
  return (
    <PreviewFrame>
      <div className="flex h-full flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            Article
          </div>
          <div className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
            5 min read
          </div>
        </div>
        <h4 className="font-display text-sm font-medium leading-snug text-slate-800 dark:text-slate-100">
          Your brain rewrites memory every time you recall it
        </h4>
        <div className="flex-1 space-y-2 overflow-hidden text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
          <p>
            We imagine memory as a filing cabinet. You retrieve a file, read it, put it back exactly
            where you found it. Neuroscience suggests it works more like a document that gets
            rewritten every time you open it.
          </p>
          <h5 className="font-display text-[11px] font-semibold text-slate-800 dark:text-slate-100">
            What reconsolidation means
          </h5>
          <p>
            Every act of remembering is an act of re-encoding. The memory returns to the present
            moment, picks up the emotional weather of the room, and goes back into storage subtly
            changed.
          </p>
          <ul className="ml-3 list-disc space-y-0.5 marker:text-slate-400 dark:marker:text-slate-500">
            <li>The past gets rewritten by the present.</li>
            <li>Confident memories are often the most revised.</li>
            <li>Details erode faster than emotional tone.</li>
          </ul>
          <p>This is why the past feels more vivid in hindsight than it did at the time.</p>
        </div>
      </div>
    </PreviewFrame>
  );
}
