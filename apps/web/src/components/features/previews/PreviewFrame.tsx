import { clsx } from 'clsx';
import type { ReactNode } from 'react';

interface PreviewFrameProps {
  children: ReactNode;
  className?: string;
}

export default function PreviewFrame({ children, className }: PreviewFrameProps) {
  return (
    <div
      className={clsx(
        'relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200',
        className
      )}
    >
      {children}
    </div>
  );
}
