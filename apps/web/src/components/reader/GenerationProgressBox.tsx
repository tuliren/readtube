'use client';

import { Loader2 } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import {
  type GenerationStage,
  type GenerationSubject,
  formatElapsed,
  stageCopy,
  stageProgress,
} from '@/lib/reader/generationProgress';

const TICK_MS = 200;

interface Props {
  stage: GenerationStage;
  subject: GenerationSubject;
  /** Optional footer, e.g. a "Watch on YouTube" link. */
  children?: ReactNode;
}

/**
 * The box shown in the Summary / Article tab while a generation has
 * no readable content yet: what is happening right now above a
 * progress bar, plus the elapsed time. Replaces the old wall of
 * skeleton bars, which gave no hint of whether anything was moving.
 *
 * The bar is time-eased per stage (see `stageProgress`) and never
 * moves backwards: each stage change re-bases from the value on
 * screen. Elapsed time counts from when the box mounted.
 */
export default function GenerationProgressBox({ stage, subject, children }: Props) {
  // The ticking interval reads the latest stage through a ref so a
  // stage change doesn't restart the clock.
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const [view, setView] = useState({ progress: 0, elapsedMs: 0 });

  useEffect(() => {
    const mountedAt = Date.now();
    let stageKind = stageRef.current.kind;
    let stageStartedAt = mountedAt;
    let base = 0;
    let shown = 0;
    const tick = () => {
      const now = Date.now();
      const current = stageRef.current;
      if (current.kind !== stageKind) {
        stageKind = current.kind;
        stageStartedAt = now;
        base = shown;
      }
      shown = Math.max(shown, stageProgress(base, current, now - stageStartedAt));
      setView({ progress: shown, elapsedMs: now - mountedAt });
    };
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const copy = stageCopy(stage, subject);
  const percent = Math.round(view.progress);

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p
          aria-live="polite"
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
          {copy.title}
        </p>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatElapsed(view.elapsedMs)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={copy.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-blue-600 transition-[width] duration-300 ease-out"
          style={{ width: `${view.progress}%` }}
        />
      </div>
      {copy.detail != null && <p className="mt-2 text-xs text-muted-foreground">{copy.detail}</p>}
      {children}
    </div>
  );
}
