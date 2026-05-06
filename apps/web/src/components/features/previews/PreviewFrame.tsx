import { clsx } from 'clsx';
import type { ReactNode } from 'react';

interface PreviewFrameProps {
  children: ReactNode;
  className?: string;
  /** Drop the default `p-6` so the inner demo can extend its rows
   *  to the frame edges (used by the inbox demo). */
  noPadding?: boolean;
}

export default function PreviewFrame({
  children,
  className,
  noPadding = false,
}: PreviewFrameProps) {
  return (
    <div
      className={clsx(
        'relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700',
        !noPadding && 'p-6',
        className
      )}
    >
      {children}
    </div>
  );
}
