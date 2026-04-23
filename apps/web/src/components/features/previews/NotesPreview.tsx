import PreviewFrame from './PreviewFrame';

export default function NotesPreview() {
  return (
    <PreviewFrame>
      <div className="relative flex h-full flex-col gap-2.5">
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
          <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
          Highlights
        </div>
        <div className="flex-1 space-y-2 overflow-hidden text-[10px] leading-relaxed text-slate-700 dark:text-slate-200">
          <p>
            The octopus has three hearts, nine brains, and blood that runs blue instead of red. It
            evolved intelligence along a lineage so distant from ours that{' '}
            <span className="rounded bg-yellow-200/80 px-0.5 py-0.5 dark:bg-yellow-500/30 dark:text-yellow-100">
              it is the closest thing we have to studying alien cognition
            </span>
            .
          </p>
          <p className="text-slate-600 dark:text-slate-300">
            Each arm has its own neural cluster. The central brain delegates rather than commands.
            Two-thirds of the animal&apos;s neurons live in its limbs, solving problems locally
            while the brain supervises from a distance.
          </p>
          <p className="text-slate-600 dark:text-slate-300">
            They open jars. They recognize individual humans.{' '}
            <span className="rounded bg-yellow-200/80 px-0.5 py-0.5 dark:bg-yellow-500/30 dark:text-yellow-100">
              They dream, maybe.
            </span>{' '}
            And they live only a few years, taking most of what they learn with them when they go.
          </p>
        </div>
        <div className="absolute bottom-2 right-2 w-48 rotate-2 rounded-md bg-yellow-100 p-3 shadow-md ring-1 ring-yellow-200/80 dark:bg-yellow-900/40 dark:ring-yellow-700/60">
          <div className="flex items-center justify-between">
            <div className="rounded bg-yellow-200 px-1.5 py-0.5 font-mono text-[10px] font-medium text-yellow-800 dark:bg-yellow-800/60 dark:text-yellow-200">
              0:42
            </div>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-yellow-900/80 dark:text-yellow-100/80">
            come back, what does intelligence even mean if this lineage has it too?
          </p>
        </div>
      </div>
    </PreviewFrame>
  );
}
