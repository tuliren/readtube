import { Prisma, prisma } from '@readtube/database';
import { Output, streamText } from 'ai';
import { FatalError, getWritable } from 'workflow';
import { z } from 'zod';

import { DEFAULT_AI_MODEL } from '@/constants';
import { CURRENT_FRONTMATTER_VERSION, serializeMarkdownDocument } from '@/lib/markdownFrontmatter';

export const SUMMARY_PROMPT_VERSION = 'v8';

export type SummaryField = 'headline' | 'short' | 'full';
export const SUMMARY_FIELDS: readonly SummaryField[] = ['headline', 'short', 'full'] as const;
export const FIELDS_WITH_FRONTMATTER: ReadonlySet<SummaryField> = new Set<SummaryField>([
  'short',
  'full',
]);

const CONTENT_WITH_LATEX_SCHEMA = z.object({
  content: z
    .string()
    .describe('The markdown body of the summary. Do not include any YAML frontmatter.'),
  hasLatex: z
    .boolean()
    .describe(
      'True if the content field above contains at least one LaTeX math formula wrapped in single or double dollar signs (e.g. $E = mc^2$ or $$\\int_0^1 x\\,dx$$). False otherwise. Dollar amounts like "$5 million" are not math and must not set this flag to true.'
    ),
});

export type SummaryStreamEvent =
  | { field: SummaryField; delta: string }
  | { field: SummaryField; hasLatex: boolean }
  | { field: SummaryField; error: string }
  | { type: 'done' }
  | { error: string };

export interface SummaryFieldPrompt {
  field: SummaryField;
  prompt: string;
}

export interface SummaryWorkflowInput {
  fields: SummaryFieldPrompt[];
  transcriptId: string;
  language: string | null;
}

interface FieldResult {
  field: SummaryField;
  content: string;
  hasLatex: boolean;
  usage: unknown;
}

export interface GeneratedSummary {
  results: FieldResult[];
}

// See articleWorkflow's steps.ts for the rationale.
const FLUSH_CHARS = 60;
const FLUSH_INTERVAL_MS = 80;

export async function generateSummaryStep(input: SummaryWorkflowInput): Promise<GeneratedSummary> {
  'use step';

  type StructuredOutput = z.infer<typeof CONTENT_WITH_LATEX_SCHEMA>;
  type UsageProducer = { usage: PromiseLike<unknown> };
  interface TextGen {
    kind: 'text';
    field: SummaryField;
    result: UsageProducer;
    iterator: AsyncIterator<string>;
  }
  interface ObjectGen {
    kind: 'object';
    field: SummaryField;
    result: UsageProducer & { output: PromiseLike<StructuredOutput> };
    iterator: AsyncIterator<Partial<StructuredOutput>>;
  }
  type Generation = TextGen | ObjectGen;

  const generations: Generation[] = input.fields.map(({ field, prompt }): Generation => {
    if (FIELDS_WITH_FRONTMATTER.has(field)) {
      const result = streamText({
        model: DEFAULT_AI_MODEL,
        output: Output.object({ schema: CONTENT_WITH_LATEX_SCHEMA }),
        prompt,
      });
      return {
        kind: 'object',
        field,
        result,
        iterator: result.partialOutputStream[Symbol.asyncIterator](),
      };
    }
    const result = streamText({ model: DEFAULT_AI_MODEL, prompt });
    return {
      kind: 'text',
      field,
      result,
      iterator: result.textStream[Symbol.asyncIterator](),
    };
  });

  const writable = getWritable<SummaryStreamEvent>();
  const writer = writable.getWriter();

  const accumulated: Record<SummaryField, string> = {
    headline: '',
    short: '',
    full: '',
  };
  const hasLatexByField: Partial<Record<SummaryField, boolean>> = {};
  const fieldErrors: Partial<Record<SummaryField, string>> = {};
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

  try {
    // Pump every requested field's stream concurrently. Each pump
    // owns its own `pending[field]` / `lastFlushAt[field]` slot, so
    // there's no shared mutable state between them. Concurrent
    // `writer.write()` calls from different pumps are safe because
    // `WritableStreamDefaultWriter.write` is spec-bound to FIFO-queue
    // chunks in call order — the workflow runtime returns a standard
    // `WritableStream` (the writable side of a `TransformStream`
    // piped to the Redis-backed server stream), and `pipeTo`
    // preserves order through to the consumer.
    const pumps = generations.map(async (gen) => {
      const { field } = gen;
      try {
        if (gen.kind === 'text') {
          while (true) {
            const next = await gen.iterator.next();
            if (next.done) {
              break;
            }
            if (next.value) {
              accumulated[field] += next.value;
              pending[field] += next.value;
              await maybeFlushField(field);
            }
          }
          await flushField(field);
          return;
        }
        let emittedHasLatex = false;
        while (true) {
          const next = await gen.iterator.next();
          if (next.done) {
            break;
          }
          const partial = next.value;
          if (partial == null) {
            continue;
          }
          if (
            typeof partial.content === 'string' &&
            partial.content.length > accumulated[field].length
          ) {
            const delta = partial.content.slice(accumulated[field].length);
            accumulated[field] = partial.content;
            pending[field] += delta;
            await maybeFlushField(field);
          }
          if (!emittedHasLatex && typeof partial.hasLatex === 'boolean') {
            // Drain pending content for this field before the flag
            // so order is preserved on the wire.
            await flushField(field);
            emittedHasLatex = true;
            hasLatexByField[field] = partial.hasLatex;
            await writer.write({ field, hasLatex: partial.hasLatex });
          }
        }
        // Final tail flush before the optional fallback hasLatex.
        await flushField(field);
        if (!emittedHasLatex) {
          try {
            const settled = await gen.result.output;
            hasLatexByField[field] = settled.hasLatex;
            await writer.write({ field, hasLatex: settled.hasLatex });
          } catch {
            // Body already streamed; classification is best-effort.
          }
        }
      } catch (err) {
        console.error(`[summaryWorkflow] ${field} stream error:`, err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        fieldErrors[field] = message;
        await writer.write({ field, error: message });
      }
    });

    await Promise.all(pumps);

    const allFieldsHaveContent = input.fields.every(
      ({ field }) => accumulated[field].trim().length > 0
    );
    const hadFieldError = Object.keys(fieldErrors).length > 0;
    if (hadFieldError) {
      // Don't retry — partial deltas already on the wire.
      throw new FatalError('One or more summary fields failed to generate.');
    }
    if (!allFieldsHaveContent) {
      throw new FatalError('Generation produced no content');
    }

    const usages = await Promise.all(
      generations.map(async (g) => {
        try {
          return await g.result.usage;
        } catch {
          return null;
        }
      })
    );

    return {
      results: generations.map((g, idx) => ({
        field: g.field,
        content: accumulated[g.field].trim(),
        hasLatex: hasLatexByField[g.field] === true,
        usage: usages[idx],
      })),
    };
  } finally {
    writer.releaseLock();
  }
}

export async function persistSummaryStep(
  input: SummaryWorkflowInput & GeneratedSummary
): Promise<void> {
  'use step';

  const { transcriptId, language, fields, results } = input;
  const requestedFields = new Set(fields.map((f) => f.field));
  const resultByField = new Map(results.map((r) => [r.field, r]));

  // Merge with any existing row so non-regenerated fields stay intact.
  const existing = await prisma.summary.findFirst({
    where: { transcript_id: transcriptId, language },
    select: { id: true, headline: true, short: true, full: true, usage: true },
  });

  const mergedUsageObj: Record<string, unknown> = {
    ...((existing?.usage as Record<string, unknown> | null) ?? {}),
  };
  for (const r of results) {
    mergedUsageObj[r.field] = r.usage != null ? JSON.parse(JSON.stringify(r.usage)) : null;
  }
  const mergedUsage = JSON.parse(JSON.stringify(mergedUsageObj));

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

  const summaryData = {
    headline: requestedFields.has('headline')
      ? wrapForStorage('headline')
      : (existing?.headline ?? null),
    short: requestedFields.has('short') ? wrapForStorage('short') : (existing?.short ?? null),
    full: requestedFields.has('full') ? wrapForStorage('full') : (existing?.full ?? null),
    prompt_version: SUMMARY_PROMPT_VERSION,
    model: DEFAULT_AI_MODEL,
    usage: mergedUsage,
  };

  if (existing) {
    await prisma.summary.update({
      where: { id: existing.id },
      data: { ...summaryData, generated_at: new Date() },
    });
    return;
  }
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

export async function emitTerminalEventStep(event: SummaryStreamEvent): Promise<void> {
  'use step';

  const writable = getWritable<SummaryStreamEvent>();
  const writer = writable.getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
  await getWritable<SummaryStreamEvent>().close();
}
