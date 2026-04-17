import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface FeatureRowProps {
  icon: LucideIcon;
  title: string;
  description: string;
  preview: ReactNode;
  reverse?: boolean;
}

export default function FeatureRow({
  icon: Icon,
  title,
  description,
  preview,
  reverse = false,
}: FeatureRowProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center gap-10 lg:flex-row lg:gap-16',
        reverse && 'lg:flex-row-reverse'
      )}
    >
      <div className="flex-1">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="mt-6 font-display text-2xl font-medium text-slate-800 sm:text-3xl">
          {title}
        </h3>
        <p className="mt-4 text-lg leading-relaxed text-slate-500">{description}</p>
      </div>
      <div className="w-full flex-1">{preview}</div>
    </div>
  );
}
