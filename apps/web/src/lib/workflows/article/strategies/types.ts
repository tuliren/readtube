import type { ArticleStyle } from '@readtube/database';

import type { TranscriptSegment } from '@/lib/platforms/types';

export interface ArticleWorkflowInput {
  transcriptId: string;
  style: ArticleStyle;
  /** Target language; null = original. */
  language: string | null;

  segments: TranscriptSegment[];
  videoTitle: string;
  channelName: string;
  /**
   * Detected source language for "Original" requests; null for
   * explicit target-language requests since those force translation.
   */
  sourceLanguage: string | null;
  /** Drives strategy selection — see `selectStrategy`. */
  durationSeconds: number | null;
  /**
   * Optional pointer to the row in `UserRequest` that triggered this
   * workflow. Set by the route's normal-generate path so the persist
   * step can backfill `usage` and `completed_at`; the revert step
   * flips it to FAILED on error. Nullable so force-regen runs and
   * any in-flight workflows that started before this column existed
   * keep working.
   */
  userRequestId?: string | null;
}

export interface GeneratedArticle {
  content: string;
  hasLatex: boolean;
  /** Aggregated token usage across all LLM calls in the strategy. Best-effort. */
  usage: unknown;
}

export type ArticleStreamEvent =
  // Single-pass + cache replay:
  | { delta: string }
  | { hasLatex: boolean }
  // Map-reduce phases (the wire stays additive; consumers that don't
  // know about these events just ignore them):
  | { phase: 'embedding' }
  | { phase: 'planning'; sectionsTotal: number }
  | { phase: 'reducing' }
  | { section: number; topic: string; body: string; hasLatex: boolean }
  | { reduce: { articleTitle: string; headings: string[] } }
  // Terminal:
  | { type: 'done' }
  | { error: string };

export interface GenerationContext {
  writer: WritableStreamDefaultWriter<ArticleStreamEvent>;
}

export interface ArticleGenerationStrategy {
  readonly name: 'single-pass' | 'map-reduce';
  generate(input: ArticleWorkflowInput, context: GenerationContext): Promise<GeneratedArticle>;
}
