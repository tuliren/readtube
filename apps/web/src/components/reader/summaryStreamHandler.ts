/**
 * Event handler for the NDJSON wire protocol that carries summary
 * generation, shared by the POST-driven stream and the GET tap-in
 * stream. Events:
 *
 *   { phase: 'generating' }        generation step started
 *   { field, delta }               append to a field
 *   { field, hasLatex }            per-field LaTeX flag
 *   { type: 'done' } / { error }   terminal
 */
export type SummaryField = 'headline' | 'short' | 'full';

export interface SummaryStreamSetters {
  /** Fires with the full accumulated value of a field after each delta. */
  onFieldContent: (field: SummaryField, content: string) => void;
  onHasLatex: (field: 'short' | 'full', hasLatex: boolean) => void;
  /** The workflow's generation step began (model is reading). */
  onGenerating: () => void;
}

export interface SummaryStreamState {
  accumulated: Record<SummaryField, string>;
  sawDone: boolean;
  error: string | null;
}

export interface SummaryStreamHandler {
  onEvent: (event: unknown) => void;
  getState: () => SummaryStreamState;
}

export function createSummaryStreamHandler(setters: SummaryStreamSetters): SummaryStreamHandler {
  const accumulated: Record<SummaryField, string> = { headline: '', short: '', full: '' };
  let sawDone = false;
  let error: string | null = null;

  const onEvent: SummaryStreamHandler['onEvent'] = (raw) => {
    if (typeof raw !== 'object' || raw === null) {
      return;
    }
    const e = raw as {
      field?: SummaryField;
      delta?: string;
      hasLatex?: boolean;
      error?: string;
      type?: string;
      phase?: string;
    };
    if (e.type === 'done') {
      sawDone = true;
      return;
    }
    if (e.phase === 'generating') {
      setters.onGenerating();
      return;
    }
    if (e.field != null && typeof e.delta === 'string') {
      accumulated[e.field] += e.delta;
      setters.onFieldContent(e.field, accumulated[e.field]);
    } else if (e.field != null && typeof e.hasLatex === 'boolean') {
      if (e.field === 'short' || e.field === 'full') {
        setters.onHasLatex(e.field, e.hasLatex);
      }
    } else if (typeof e.error === 'string') {
      // Both per-field errors (`{field, error}`) and top-level errors
      // (`{error}` from a workflow generation/persist failure) abort
      // the stream with the same UX.
      error = e.error;
    }
  };

  return {
    onEvent,
    getState: () => ({ accumulated: { ...accumulated }, sawDone, error }),
  };
}

/**
 * The error to show once a summary stream has closed, or null when
 * it finished cleanly with content for at least one of `fields`.
 */
export function summaryStreamFailure(
  state: SummaryStreamState,
  fields: readonly SummaryField[]
): string | null {
  if (state.error != null) {
    return state.error;
  }
  if (!state.sawDone) {
    // Stream closed without an explicit terminator. Don't trust the
    // accumulated content: the workflow may still be persisting in
    // the background, and a refresh will pick it up if it lands.
    return 'Generation ended unexpectedly. Please refresh in a moment, or try again.';
  }
  if (!fields.some((f) => state.accumulated[f].trim().length > 0)) {
    return 'No content was generated. Please try again.';
  }
  return null;
}
