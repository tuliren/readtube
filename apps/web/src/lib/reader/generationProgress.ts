/**
 * Stages shown in the Summary / Article progress box while a
 * generation has not produced any readable content yet. The first
 * two run client-side before the generate POST; the rest track the
 * workflow's NDJSON stream.
 *
 *   transcript    POST /transcript is fetching platform captions
 *   transcribing  AI transcription is running (captionless video)
 *   starting      generate POST in flight (prompt build + workflow start)
 *   queued        stream open, workflow hasn't reported in yet
 *   resuming      tapped into an already-running generation
 *   drafting      workflow emitted `phase: 'generating'`; model is
 *                 reading the transcript, no tokens yet
 *   embedding     map-reduce: finding topic boundaries
 *   writing       map-reduce: section bodies in flight
 *   reducing      map-reduce: consolidating the outline
 */
export type GenerationStage =
  | { kind: 'transcript' }
  | { kind: 'transcribing' }
  | { kind: 'starting' }
  | { kind: 'queued' }
  | { kind: 'resuming' }
  | { kind: 'drafting' }
  | { kind: 'embedding' }
  | { kind: 'writing'; sectionsReady: number; sectionsTotal: number }
  | { kind: 'reducing' };

export type GenerationSubject = 'summary' | 'article';

/** The bar never reaches 100% on its own; the box disappears once
 *  content lands, so a full bar would only ever flash. */
export const PROGRESS_CAP = 95;

interface CreepParams {
  /** Fraction of the remaining distance to PROGRESS_CAP this stage
   *  may cover. Lower for quick stages so later ones keep room. */
  share: number;
  /** Time constant of the exponential approach, in ms. Roughly the
   *  typical duration of the stage. */
  tauMs: number;
}

const CREEP: Record<Exclude<GenerationStage['kind'], 'writing'>, CreepParams> = {
  transcript: { share: 0.35, tauMs: 4_000 },
  transcribing: { share: 0.6, tauMs: 90_000 },
  starting: { share: 0.3, tauMs: 3_000 },
  queued: { share: 0.3, tauMs: 5_000 },
  resuming: { share: 0.5, tauMs: 3_000 },
  drafting: { share: 0.6, tauMs: 15_000 },
  embedding: { share: 0.25, tauMs: 8_000 },
  reducing: { share: 0.6, tauMs: 8_000 },
};

/** Share of the remaining distance covered once every section is in. */
const WRITING_SHARE = 0.85;

/**
 * Progress (0–PROGRESS_CAP) for a stage that started at `base`
 * percent `elapsedMs` ago. Most stages have no real progress signal,
 * so the bar eases toward a stage-specific ceiling and slows down the
 * longer the stage runs, which reads as "still working" without ever
 * stalling or overshooting. Map-reduce writing has a real signal
 * (sections ready / total) and uses it directly.
 *
 * Callers keep `base` at the value displayed when the stage began, so
 * the bar stays monotonic across stage changes.
 */
export function stageProgress(base: number, stage: GenerationStage, elapsedMs: number): number {
  const start = clamp(base, 0, PROGRESS_CAP);
  const remaining = PROGRESS_CAP - start;
  if (stage.kind === 'writing') {
    if (stage.sectionsTotal <= 0) {
      return start;
    }
    const fraction = clamp(stage.sectionsReady / stage.sectionsTotal, 0, 1);
    return start + remaining * WRITING_SHARE * fraction;
  }
  const { share, tauMs } = CREEP[stage.kind];
  const eased = 1 - Math.exp(-Math.max(elapsedMs, 0) / tauMs);
  return start + remaining * share * eased;
}

export interface StageCopy {
  title: string;
  detail: string | null;
}

/** What the box says it is doing right now, shown above the bar. */
export function stageCopy(stage: GenerationStage, subject: GenerationSubject): StageCopy {
  switch (stage.kind) {
    case 'transcript':
      return {
        title: 'Fetching the transcript',
        detail: 'Looking up the video’s captions.',
      };
    case 'transcribing':
      return {
        title: 'Transcribing the video with AI',
        detail:
          'This can take several minutes for long videos. You can leave this page; it keeps running in the background.',
      };
    case 'starting':
      return {
        title: `Starting the ${subject}`,
        detail: 'Preparing the transcript for the AI.',
      };
    case 'queued':
      return {
        title: 'Waiting for the AI to pick up the job',
        detail: null,
      };
    case 'resuming':
      return {
        title: `Reconnecting to the ${subject} in progress`,
        detail: null,
      };
    case 'drafting':
      return {
        title: 'Reading the transcript',
        detail: `The ${subject} will start appearing here as soon as the AI begins writing.`,
      };
    case 'embedding':
      return {
        title: 'Mapping the topics in this long video',
        detail: 'Long videos are split into sections that are written in parallel.',
      };
    case 'writing':
      return {
        title: `Writing ${stage.sectionsTotal} ${stage.sectionsTotal === 1 ? 'section' : 'sections'}`,
        detail: `${stage.sectionsReady} of ${stage.sectionsTotal} ready`,
      };
    case 'reducing':
      return {
        title: 'Polishing the outline',
        detail: 'Tidying section headings across the article.',
      };
  }
}

/** "8s", "1m 05s" — elapsed time shown next to the stage title. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
