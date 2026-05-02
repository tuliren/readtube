import { Output, streamText } from 'ai';
import type { z } from 'zod';

import {
  DEFAULT_AI_MODEL,
  MAX_PRESTREAM_ATTEMPTS,
  STREAM_INACTIVITY_TIMEOUT_MS,
} from '@/constants';

export interface StreamWithGuardsResult<TOutput> {
  /**
   * Final structured output, or `null` if `result.output` threw after
   * the partial stream completed (rare — typically a schema-coercion
   * issue that didn't show during streaming). Callers tracking
   * accumulated state externally can fall back to that.
   */
  output: TOutput | null;
  /** Token-usage metadata. Best-effort — `null` if the SDK didn't surface it. */
  usage: unknown;
}

export interface StreamWithGuardsArgs<TSchema extends z.ZodTypeAny> {
  prompt: string;
  schema: TSchema;
  /**
   * Invoked on every non-null partial. Caller tracks any external
   * state (e.g., what's been written to a client stream) so retry
   * semantics can be guarded via {@link StreamWithGuardsArgs.canRetry}.
   */
  onPartial: (partial: Partial<z.infer<TSchema>>) => Promise<void>;
  /**
   * Predicate evaluated after a failed attempt. Returning false stops
   * retries even if budget remains — single-pass uses this to avoid
   * re-streaming deltas the client has already seen. Default: always
   * allow retry, used by per-section calls that don't stream
   * mid-generation and so can retry freely.
   */
  canRetry?: () => boolean;
  /** Log prefix for diagnostics. */
  label: string;
}

/**
 * Wrap a `streamText` call with the retry + inactivity-watchdog
 * pattern PR #82 added to the article step. Both the single-pass and
 * map-reduce per-section call sites use this so the resilience
 * behaviour is consistent across strategies.
 *
 * Throws the underlying error after retries are exhausted (or on the
 * first failure if `canRetry()` returns false). Callers running in a
 * workflow step typically wrap with `FatalError` so the workflow
 * surfaces a clean terminal state.
 */
export async function streamWithGuards<TSchema extends z.ZodTypeAny>({
  prompt,
  schema,
  onPartial,
  canRetry,
  label,
}: StreamWithGuardsArgs<TSchema>): Promise<StreamWithGuardsResult<z.infer<TSchema>>> {
  let attempt = 0;
  let lastErr: unknown = null;

  while (attempt < MAX_PRESTREAM_ATTEMPTS) {
    attempt++;

    const inactivityController = new AbortController();
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    const armWatchdog = () => {
      if (inactivityTimer != null) {
        clearTimeout(inactivityTimer);
      }
      inactivityTimer = setTimeout(
        () =>
          inactivityController.abort(
            new Error(`No tokens received within ${STREAM_INACTIVITY_TIMEOUT_MS}ms`)
          ),
        STREAM_INACTIVITY_TIMEOUT_MS
      );
    };
    armWatchdog();

    const result = streamText({
      model: DEFAULT_AI_MODEL,
      output: Output.object({ schema }),
      prompt,
      abortSignal: inactivityController.signal,
    });

    try {
      for await (const partial of result.partialOutputStream) {
        armWatchdog();
        if (partial == null) {
          continue;
        }
        await onPartial(partial as Partial<z.infer<TSchema>>);
      }

      let output: z.infer<TSchema> | null = null;
      try {
        output = (await result.output) as z.infer<TSchema>;
      } catch {
        // Partial stream completed but settling the structured output
        // threw — fall back to caller's accumulated state.
      }

      let usage: unknown = null;
      try {
        usage = await result.usage;
      } catch {
        // best-effort
      }

      if (inactivityTimer != null) {
        clearTimeout(inactivityTimer);
      }
      return { output, usage };
    } catch (err) {
      lastErr = err;
      if (inactivityTimer != null) {
        clearTimeout(inactivityTimer);
      }

      const allowRetry = canRetry == null || canRetry();
      if (allowRetry && attempt < MAX_PRESTREAM_ATTEMPTS) {
        console.warn(
          `[${label}] streamText attempt ${attempt}/${MAX_PRESTREAM_ATTEMPTS} failed; retrying`,
          err
        );
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
        continue;
      }

      console.error(`[${label}] streamText error:`, err);
      throw err;
    }
  }

  // Unreachable in practice — the loop body throws when retries are
  // exhausted — but TS demands a terminator and we surface the last
  // error in case the invariants ever drift.
  throw lastErr ?? new Error(`[${label}] streamText failed`);
}
