'use client';

import { Loader2 } from 'lucide-react';

interface Props {
  onClick: () => void;
  /** Explicitly disable the button (e.g. while a stream is running). */
  disabled?: boolean;
  /** When true, shows a spinner + "Regenerating…" and blocks clicks.
   *  Tabs that render a skeleton instead of an in-place spinner leave
   *  this unset and just hide the button while regenerating. */
  regenerating?: boolean;
  /** Tooltip; defaults to "Regenerate". */
  title?: string;
}

/**
 * Shared "Regenerate" affordance used across the reader tabs
 * (Transcript, Summary, Article) so they stay visually identical — a
 * small pill matching the transcript tab's button.
 */
export default function RegenerateButton({
  onClick,
  disabled,
  regenerating = false,
  title = 'Regenerate',
}: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled === true || regenerating}
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
    >
      {regenerating ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Regenerating…
        </>
      ) : (
        'Regenerate'
      )}
    </button>
  );
}
