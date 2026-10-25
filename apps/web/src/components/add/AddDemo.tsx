'use client';

import { Check, Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ADD_DEMO_SAMPLES } from '@/lib/add/demoSamples';
import { type AddKind, describeAddTarget, detectAddTarget } from '@/lib/add/detectAddTarget';
import { cn } from '@/lib/utils';

import { ADD_KINDS, ADD_KIND_ORDER } from './addKinds';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

const OUTCOMES: Record<AddKind, string> = {
  channel: 'Followed. New uploads land in your inbox.',
  video: 'Added. Opening the article.',
  playlist: 'Added. Every video becomes a reading list.',
};

const TYPE_MS = 45;
const DETECT_DELAY_MS = 300;
const DETECTED_MS = 1500;
const ADDED_MS = 1400;

type Phase = 'typing' | 'detected' | 'added';

interface Props {
  samples?: string[];
  /** Force the static (reduced-motion) rendering; defaults to the
   *  user's `prefers-reduced-motion` setting. */
  animate?: boolean;
}

/**
 * A looping, non-interactive demo of the Add dialog: a link is
 * "pasted" into a mock input, the real classifier recognizes it, and
 * the matching kind lights up. Shows new users that one box accepts
 * channels, videos, and playlists alike. Falls back to a static list
 * of link-to-kind rows when reduced motion is requested.
 */
export default function AddDemo({ samples = ADD_DEMO_SAMPLES, animate }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const animated = animate ?? !reducedMotion;

  return (
    <figure className="w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm">
      <figcaption className="sr-only">
        Paste a YouTube or Bilibili link and ReadTube recognizes whether it is a channel, a video,
        or a playlist.
      </figcaption>
      {animated ? <AnimatedDemo samples={samples} /> : <StaticDemo samples={samples} />}
    </figure>
  );
}

function AnimatedDemo({ samples }: { samples: string[] }) {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<Phase>('typing');
  const sample = samples[index % samples.length];

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (phase === 'typing') {
      timer =
        typed < sample.length
          ? setTimeout(() => setTyped((t) => t + 1), TYPE_MS)
          : setTimeout(() => setPhase('detected'), DETECT_DELAY_MS);
    } else if (phase === 'detected') {
      timer = setTimeout(() => setPhase('added'), DETECTED_MS);
    } else {
      timer = setTimeout(() => {
        setIndex((i) => (i + 1) % samples.length);
        setTyped(0);
        setPhase('typing');
      }, ADDED_MS);
    }
    return () => clearTimeout(timer);
  }, [phase, typed, sample, samples.length]);

  const detected = phase === 'typing' ? null : (detectAddTarget(sample)?.primary ?? null);

  return (
    <div aria-hidden className="space-y-3">
      <KindTrack activeKind={detected?.kind ?? null} />
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
          {sample.slice(0, typed)}
          {phase === 'typing' && (
            <span className="ml-px inline-block h-4 w-px animate-pulse bg-foreground align-middle" />
          )}
        </span>
        <span
          className={cn(
            'shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            detected != null ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground',
            phase === 'added' && 'scale-95'
          )}
        >
          {detected != null ? `Add ${detected.kind}` : 'Add'}
        </span>
      </div>
      <p className="flex h-5 items-center gap-1.5 text-sm">
        {phase === 'detected' && detected != null && (
          <span className="text-emerald-700 dark:text-emerald-400">
            Looks like a <span className="font-medium">{describeAddTarget(detected)}</span>
          </span>
        )}
        {phase === 'added' && detected != null && (
          <span className="flex items-center gap-1.5 text-foreground">
            <Check className="h-4 w-4 text-emerald-600" />
            {OUTCOMES[detected.kind]}
          </span>
        )}
      </p>
    </div>
  );
}

function StaticDemo({ samples }: { samples: string[] }) {
  return (
    <ul className="space-y-2">
      {samples.map((sample) => {
        const detected = detectAddTarget(sample)?.primary;
        if (detected == null) {
          return null;
        }
        const Icon = ADD_KINDS[detected.kind].icon;
        return (
          <li key={sample} className="flex flex-wrap items-center gap-2 text-sm">
            <code className="min-w-0 truncate rounded bg-muted px-1.5 py-0.5">{sample}</code>
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <Icon className="h-3.5 w-3.5" />
              {describeAddTarget(detected)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function KindTrack({ activeKind }: { activeKind: AddKind | null }) {
  return (
    <div className="flex gap-2">
      {ADD_KIND_ORDER.map((kind) => {
        const info = ADD_KINDS[kind];
        const Icon = info.icon;
        const active = kind === activeKind;
        return (
          <span
            key={kind}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-all duration-300',
              active
                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-300'
                : 'border-border text-muted-foreground'
            )}
          >
            <Icon className="h-3 w-3" />
            {info.title}
          </span>
        );
      })}
    </div>
  );
}
