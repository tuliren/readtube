import { GenerationStatus, Prisma, prisma } from '@readtube/database';
import { Output, streamText } from 'ai';
import { FatalError, getWorkflowMetadata, getWritable } from 'workflow';
import { z } from 'zod';

import { DEFAULT_AI_MODEL } from '@/constants';
import { CURRENT_FRONTMATTER_VERSION, serializeMarkdownDocument } from '@/lib/markdownFrontmatter';
import { emitTerminalEvent } from '@/lib/workflows/emitTerminalEvent';
import { revertSummaryRow } from '@/lib/workflows/runRegistry';

export const SUMMARY_PROMPT_VERSION = 'v9';

export type SummaryField = 'headline' | 'short' | 'full';
export const SUMMARY_FIELDS: readonly SummaryField[] = ['headline', 'short', 'full'] as const;
export const FIELDS_WITH_FRONTMATTER: ReadonlySet<SummaryField> = new Set<SummaryField>([
  'short',
  'full',
]);

const HAS_LATEX_DESCRIPTION =
  'True if this field\'s content contains at least one LaTeX math formula wrapped in single or double dollar signs (e.g. $E = mc^2$ or $$\\int_0^1 x\\,dx$$). False otherwise. Dollar amounts like "$5 million" are not math and must not set this flag to true.';

const HEADLINE_DESCRIPTION =
  'Newspaper-style title under 10 words. Plain text only — no markdown, no surrounding quotes, no "Title:" prefix.';
const SHORT_CONTENT_DESCRIPTION =
  '2-3 sentence summary in plain prose. First sentence is the essential point; the rest is the most important supporting context. No headings, no lists, no preamble. Do not include any YAML frontmatter.';
const FULL_CONTENT_DESCRIPTION =
  'Compact full summary — denser and longer than the short summary. Cover main arguments and conclusions in 2-3 short paragraphs, a Markdown bullet list using "- " (single-level only, terse one-liners), or a mix. Never use headings (#, ##, …) and do not bold or italicize. The full summary is NOT a truncation of the short — write it independently. Do not include any YAML frontmatter.';

function buildSummarySchema(fields: readonly SummaryField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  if (fields.includes('headline')) {
    shape.headline = z.string().describe(HEADLINE_DESCRIPTION);
  }
  if (fields.includes('short')) {
    shape.short = z.object({
      content: z.string().describe(SHORT_CONTENT_DESCRIPTION),
      hasLatex: z.boolean().describe(HAS_LATEX_DESCRIPTION),
    });
  }
  if (fields.includes('full')) {
    shape.full = z.object({
      content: z.string().describe(FULL_CONTENT_DESCRIPTION),
      hasLatex: z.boolean().describe(HAS_LATEX_DESCRIPTION),
    });
  }
  return z.object(shape);
}

type StructuredFieldPartial = { content?: string; hasLatex?: boolean };
type SummaryPartial = {
  headline?: string;
  short?: StructuredFieldPartial;
  full?: StructuredFieldPartial;
};

export type SummaryStreamEvent =
  | { field: SummaryField; delta: string }
  | { field: SummaryField; hasLatex: boolean }
  | { type: 'done' }
  | { error: string };

export interface SummaryWorkflowInput {
  fieldsToGenerate: SummaryField[];
  prompt: string;
  transcriptId: string;
  language: string | null;
}

interface FieldResult {
  field: SummaryField;
  content: string;
  hasLatex: boolean;
}

export interface GeneratedSummary {
  results: FieldResult[];
  usage: unknown;
}

// See articleWorkflow's steps.ts for the rationale.
const FLUSH_CHARS = 60;
const FLUSH_INTERVAL_MS = 80;

export async function generateSummaryStep(input: SummaryWorkflowInput): Promise<GeneratedSummary> {
  'use step';

  const fields = input.fieldsToGenerate;
  const schema = buildSummarySchema(fields);
  const result = streamText({
    model: DEFAULT_AI_MODEL,
    output: Output.object({ schema }),
    prompt: input.prompt,
  });

  const writable = getWritable<SummaryStreamEvent>();
  const writer = writable.getWriter();

  const accumulated: Record<SummaryField, string> = {
    headline: '',
    short: '',
    full: '',
  };
  const hasLatexByField: Partial<Record<SummaryField, boolean>> = {};
  const emittedHasLatex: Partial<Record<SummaryField, boolean>> = {};
  // Per-field coalescing buffers — see articleWorkflow's steps.ts
  // for the rationale (Redis-backed stream, every write is a network
  // op, structured-output partials arrive every few tokens).
  const pending: Record<SummaryField, string> = {
    headline: '',
    short: '',
    full: '',
  };
  const lastFlushAt: Record<SummaryField, number> = {
    headline: Date.now(),
    short: Date.now(),
    full: Date.now(),
  };
  const flushField = async (field: SummaryField) => {
    if (pending[field].length === 0) {
      return;
    }
    await writer.write({ field, delta: pending[field] });
    pending[field] = '';
    lastFlushAt[field] = Date.now();
  };
  const maybeFlushField = async (field: SummaryField) => {
    if (pending[field].length === 0) {
      return;
    }
    if (
      pending[field].length >= FLUSH_CHARS ||
      Date.now() - lastFlushAt[field] >= FLUSH_INTERVAL_MS
    ) {
      await flushField(field);
    }
  };

  const wantsHeadline = fields.includes('headline');
  const wantsShort = fields.includes('short');
  const wantsFull = fields.includes('full');

  const handleStructuredField = async (
    field: 'short' | 'full',
    sub: StructuredFieldPartial | undefined
  ) => {
    if (sub == null) {
      return;
    }
    if (typeof sub.content === 'string' && sub.content.length > accumulated[field].length) {
      const delta = sub.content.slice(accumulated[field].length);
      accumulated[field] = sub.content;
      pending[field] += delta;
      await maybeFlushField(field);
    }
    if (!emittedHasLatex[field] && typeof sub.hasLatex === 'boolean') {
      // Drain pending content for this field before the flag so order
      // is preserved on the wire.
      await flushField(field);
      emittedHasLatex[field] = true;
      hasLatexByField[field] = sub.hasLatex;
      await writer.write({ field, hasLatex: sub.hasLatex });
    }
  };

  try {
    for await (const partial of result.partialOutputStream as AsyncIterable<SummaryPartial>) {
      if (partial == null) {
        continue;
      }
      if (wantsHeadline && typeof partial.headline === 'string') {
        const next = partial.headline;
        if (next.length > accumulated.headline.length) {
          const delta = next.slice(accumulated.headline.length);
          accumulated.headline = next;
          pending.headline += delta;
          await maybeFlushField('headline');
        }
      }
      if (wantsShort) {
        await handleStructuredField('short', partial.short);
      }
      if (wantsFull) {
        await handleStructuredField('full', partial.full);
      }
    }

    for (const field of fields) {
      await flushField(field);
    }

    // Fallback for hasLatex if the flag never appeared in the partial
    // stream (e.g. truncated tail). Read the settled output once and
    // emit any missing flags.
    const needsFallback =
      (wantsShort && !emittedHasLatex.short) || (wantsFull && !emittedHasLatex.full);
    if (needsFallback) {
      try {
        const settled = (await result.output) as SummaryPartial;
        for (const field of ['short', 'full'] as const) {
          if (!fields.includes(field) || emittedHasLatex[field]) {
            continue;
          }
          const sub = settled[field];
          if (sub != null && typeof sub.hasLatex === 'boolean') {
            emittedHasLatex[field] = true;
            hasLatexByField[field] = sub.hasLatex;
            await writer.write({ field, hasLatex: sub.hasLatex });
          }
        }
      } catch {
        // Body already streamed; classification is best-effort.
      }
    }

    const allFieldsHaveContent = fields.every((field) => accumulated[field].trim().length > 0);
    if (!allFieldsHaveContent) {
      throw new FatalError('Generation produced no content');
    }

    let usage: unknown = null;
    try {
      usage = await result.usage;
    } catch {
      // usage telemetry is best-effort
    }

    return {
      results: fields.map((field) => ({
        field,
        content: accumulated[field].trim(),
        hasLatex: hasLatexByField[field] === true,
      })),
      usage,
    };
  } finally {
    writer.releaseLock();
  }
}

export async function persistSummaryStep(
  input: SummaryWorkflowInput & GeneratedSummary
): Promise<void> {
  'use step';

  const { transcriptId, language, fieldsToGenerate, results, usage } = input;
  const { workflowRunId } = getWorkflowMetadata();
  const requestedFields = new Set(fieldsToGenerate);
  const resultByField = new Map(results.map((r) => [r.field, r]));

  // The route's claim helper inserts a row before this step ever
  // runs, so an existing row is the steady state. Read it for the
  // merge of non-regenerated fields (per-field regenerate keeps the
  // others intact). The findFirst is intentionally not status-filtered
  // — we want the row we just claimed, which has status=GENERATING.
  const existing = await prisma.summary.findFirst({
    where: { transcript_id: transcriptId, language },
    select: { id: true, headline: true, short: true, full: true },
  });

  const wrapForStorage = (field: SummaryField): string => {
    const r = resultByField.get(field)!;
    if (!FIELDS_WITH_FRONTMATTER.has(field)) {
      return r.content;
    }
    return serializeMarkdownDocument(r.content, {
      version: CURRENT_FRONTMATTER_VERSION,
      hasLatex: r.hasLatex,
    });
  };

  // The same UPDATE atomically lands the new content AND flips status
  // back to READY, so a concurrent reader never sees the row in a
  // half-state where status=GENERATING but content is the new
  // material. workflow_id stays at our runId — useful for tracing
  // which run produced the cached row.
  const summaryData = {
    headline: requestedFields.has('headline')
      ? wrapForStorage('headline')
      : (existing?.headline ?? null),
    short: requestedFields.has('short') ? wrapForStorage('short') : (existing?.short ?? null),
    full: requestedFields.has('full') ? wrapForStorage('full') : (existing?.full ?? null),
    prompt_version: SUMMARY_PROMPT_VERSION,
    model: DEFAULT_AI_MODEL,
    usage:
      usage == null
        ? Prisma.JsonNull
        : (JSON.parse(JSON.stringify(usage)) as Prisma.InputJsonValue),
    status: GenerationStatus.READY,
    workflow_id: workflowRunId,
  };

  if (existing) {
    await prisma.summary.update({
      where: { id: existing.id },
      data: { ...summaryData, generated_at: new Date() },
    });
    return;
  }
  // Defensive fallback: the claim helper should have inserted the
  // row, but a manual DB cleanup or backfill might have removed it
  // mid-workflow. Create from scratch with the standard P2002 retry.
  try {
    await prisma.summary.create({
      data: { transcript_id: transcriptId, language, ...summaryData },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const raced = await prisma.summary.findFirst({
        where: { transcript_id: transcriptId, language },
        select: { id: true },
      });
      if (raced) {
        await prisma.summary.update({
          where: { id: raced.id },
          data: { ...summaryData, generated_at: new Date() },
        });
        return;
      }
    }
    throw err;
  }
}

/**
 * Failure-path step: revert the row this workflow claimed at start
 * time so a later request doesn't see a stuck-in-GENERATING row.
 * Wraps {@link revertSummaryRow} as a workflow step so the runtime
 * persists its execution. See `summary/index.ts` for invocation.
 */
export async function revertSummaryRowStep(input: SummaryWorkflowInput): Promise<void> {
  'use step';

  const { workflowRunId } = getWorkflowMetadata();
  await revertSummaryRow(prisma, input.transcriptId, input.language, workflowRunId);
}

export async function emitTerminalEventStep(event: SummaryStreamEvent): Promise<void> {
  'use step';
  await emitTerminalEvent(event);
}
