'use client';

import { Check } from 'lucide-react';

import { type AddKind, type AddTarget, describeAddTarget } from '@/lib/add/detectAddTarget';
import { cn } from '@/lib/utils';

import { ADD_KINDS } from './addKinds';

interface Props {
  /** Every valid reading of the input, most likely first. */
  candidates: AddTarget[];
  /** The reading that will be submitted. */
  selectedKind: AddKind;
  onSelectKind: (kind: AddKind) => void;
}

/**
 * Live feedback under the Add dialog's input: names what the pasted
 * link was recognized as, and when the link has more than one valid
 * reading (a video opened inside a playlist), lets the user pick.
 */
export default function DetectedTargetHint({ candidates, selectedKind, onSelectKind }: Props) {
  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length === 1) {
    const [only] = candidates;
    const Icon = ADD_KINDS[only.kind].icon;
    return (
      <p
        className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"
        aria-live="polite"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
          <Icon className="h-3 w-3" />
        </span>
        <span>
          Looks like a <span className="font-medium">{describeAddTarget(only)}</span>
        </span>
      </p>
    );
  }
  return (
    <div className="space-y-2" aria-live="polite">
      <p className="text-sm text-muted-foreground">This link points to more than one thing:</p>
      <div role="radiogroup" aria-label="What to add" className="flex flex-wrap gap-2">
        {candidates.map((candidate) => {
          const Icon = ADD_KINDS[candidate.kind].icon;
          const selected = candidate.kind === selectedKind;
          return (
            <button
              key={candidate.kind}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelectKind(candidate.kind)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
                selected
                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-300'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {selected ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              {describeAddTarget(candidate)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
