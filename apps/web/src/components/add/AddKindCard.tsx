'use client';

import type { AddKind } from '@/lib/add/detectAddTarget';

import { ADD_KINDS } from './addKinds';

interface Props {
  kind: AddKind;
  onClick: () => void;
}

/**
 * One "what you can add" card on the onboarding panel: what adding
 * this kind does, plus the link shapes it accepts. Clicking opens the
 * Add dialog locked to that kind.
 */
export default function AddKindCard({ kind, onClick }: Props) {
  const info = ADD_KINDS[kind];
  const Icon = info.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-2 rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/5"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
          <Icon className="h-4 w-4" />
        </span>
        {info.title}
      </span>
      <span className="text-sm text-muted-foreground">{info.blurb}</span>
      <span className="mt-auto flex flex-wrap gap-1 pt-1">
        {info.formats.map((format) => (
          <code
            key={format}
            className="rounded bg-muted px-1 text-xs text-muted-foreground group-hover:text-foreground"
          >
            {format}
          </code>
        ))}
      </span>
    </button>
  );
}
