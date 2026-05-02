import { FatalError } from 'workflow';
import { z } from 'zod';

import {
  EMBED_WINDOW_WORDS,
  MAX_PARALLEL_SECTIONS,
  MAX_SECTIONS,
  SECTION_TARGET_WORDS,
} from '@/constants';
import { countWords } from '@/lib/format/wordCount';

import { buildSectionPrompt } from '../prompts';
import { streamWithGuards } from '../streamWithGuards';
import type {
  ArticleGenerationStrategy,
  ArticleWorkflowInput,
  GeneratedArticle,
  GenerationContext,
} from '../types';
import { type TranscriptChunk, chunkTranscript } from './chunkTranscript';
import { embedWindows } from './embedWindows';
import { jaccardSimilarity } from './jaccard';
import { type SectionBrief, reduceOutline } from './reduceOutline';
import { type TopicSection, groupWindowsIntoSections } from './topicBoundaries';

const SECTION_SCHEMA = z.object({
  topic: z
    .string()
    .describe(
      'A short 3–7 word noun phrase describing what this section covers. No "Section X" prefix, no numbering, no preamble.'
    ),
  body: z
    .string()
    .describe(
      'Markdown prose covering this section. Multiple paragraphs allowed. Do NOT include a top-level heading — the heading is generated separately. Do not include a preamble or framing sentence.'
    ),
  hasLatex: z
    .boolean()
    .describe(
      'True iff the body contains a math formula in $...$ or $$...$$ form. Dollar amounts ("$5 million") are not math.'
    ),
});

interface SectionResult {
  index: number;
  topic: string;
  body: string;
  hasLatex: boolean;
  usage: unknown;
}

export const mapReduceStrategy: ArticleGenerationStrategy = {
  name: 'map-reduce',

  async generate(
    input: ArticleWorkflowInput,
    context: GenerationContext
  ): Promise<GeneratedArticle> {
    const { writer } = context;

    // Phase 1 — fine-grained windowing (~250 words each). Reuses the
    // generic word-count chunker; no LLM, deterministic.
    const windows = chunkTranscript(input.segments, {
      targetWords: EMBED_WINDOW_WORDS,
      // Plenty of windows even for 15hr videos; cap is just a runaway
      // guard. We use MAX_SECTIONS × 6 so a 200-section article can
      // still have ~6 windows per section if topic-shift cuts mostly
      // clump.
      maxChunks: MAX_SECTIONS * 6,
    });
    if (windows.length === 0) {
      throw new FatalError('Transcript produced no windows.');
    }

    // Phase 2 — embed windows + detect topic boundaries.
    await writer.write({ phase: 'embedding' });
    let sections: TopicSection[];
    try {
      const embeddings = await embedWindows(windows.map((w) => w.text));
      sections = groupWindowsIntoSections(windows, embeddings);
    } catch (err) {
      console.warn(
        '[articleWorkflow:map-reduce] embedding pipeline failed; falling back to word-count chunking',
        err
      );
      sections = fallbackSectionsFromWindows(windows);
    }

    if (sections.length === 0) {
      throw new FatalError('Section grouping produced no sections.');
    }

    await writer.write({ phase: 'planning', sectionsTotal: sections.length });

    // Phase 3 — generate section bodies in parallel with bounded
    // concurrency. Wrap in FatalError on failure: by this point we've
    // already emitted `phase: embedding`, `phase: planning`, and
    // possibly per-section completion events to the client. A workflow
    // step retry would re-execute everything and duplicate those events
    // — the client handler keys section state by index but never resets
    // its sections Map on a second `planning` event, so a retry would
    // corrupt rendered counts and content.
    let sectionResults: SectionResult[];
    try {
      sectionResults = await runWithConcurrency(
        sections,
        MAX_PARALLEL_SECTIONS,
        async (section) => {
          const result = await streamWithGuards({
            label: `articleWorkflow:map-reduce:section[${section.index}]`,
            prompt: buildSectionPrompt(input, {
              sectionIndex: section.index,
              sectionsTotal: sections.length,
              sectionText: section.text,
            }),
            schema: SECTION_SCHEMA,
            onPartial: async () => {
              // No client streaming during section generation; the
              // watchdog inside streamWithGuards only needs partials to
              // confirm the call is alive. Section completion is
              // emitted as a single event below.
            },
          });

          if (result.output == null) {
            throw new Error(`Section ${section.index} produced no structured output.`);
          }

          const sectionResult: SectionResult = {
            index: section.index,
            topic: result.output.topic,
            body: result.output.body,
            hasLatex: result.output.hasLatex,
            usage: result.usage,
          };

          // Stream the section's completion event so the frontend can
          // fill its slot. Sections complete out of order; the frontend
          // renders by index.
          await writer.write({
            section: sectionResult.index,
            topic: sectionResult.topic,
            body: sectionResult.body,
            hasLatex: sectionResult.hasLatex,
          });

          return sectionResult;
        }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Map-reduce section generation failed.';
      throw new FatalError(message);
    }

    sectionResults.sort((a, b) => a.index - b.index);

    // Phase 4 — LLM reduce pass to consolidate headings + produce a
    // top-level title. Bounded input: just topics + first ~100 words
    // of each section.
    await writer.write({ phase: 'reducing' });
    let outline;
    try {
      outline = await reduceOutline(
        input,
        sectionResults.map<SectionBrief>((s) => ({
          index: s.index,
          topic: s.topic,
          brief: firstWords(s.body, 100),
        }))
      );
    } catch (err) {
      console.warn(
        '[articleWorkflow:map-reduce] reduce pass failed; falling back to per-section topics',
        err
      );
      outline = {
        articleTitle: input.videoTitle,
        headings: sectionResults.map((s) => s.topic),
        usage: null,
      };
    }

    await writer.write({
      reduce: {
        articleTitle: outline.articleTitle,
        headings: outline.headings,
      },
    });

    // Phase 5 — assemble. Use the reduce-pass headings; further dedup
    // adjacent near-duplicates with Jaccard so a model that returned
    // similar adjacent headings still produces a clean article.
    let assembled = '';
    let aggregateHasLatex = false;
    let lastNonEmptyHeading = '';
    for (let i = 0; i < sectionResults.length; i++) {
      const section = sectionResults[i];
      let heading = (outline.headings[i] ?? '').trim();
      if (heading.length > 0 && lastNonEmptyHeading.length > 0) {
        if (jaccardSimilarity(heading, lastNonEmptyHeading) > 0.6) {
          heading = '';
        }
      }
      if (heading.length > 0) {
        assembled += `## ${heading}\n\n`;
        lastNonEmptyHeading = heading;
      }
      assembled += section.body.trim() + '\n\n';
      aggregateHasLatex = aggregateHasLatex || section.hasLatex;
    }

    const content = assembled.trim();
    if (content.length === 0) {
      throw new FatalError('Map-reduce assembly produced no content.');
    }

    // Stream the assembled content back to the client as one big
    // delta so any client without map-reduce awareness still ends up
    // with the full article in its content buffer. Map-reduce-aware
    // clients will already have rendered the per-section completion
    // events and can ignore this delta if they prefer (or accept it
    // as a redundant final state).
    await writer.write({ delta: content });
    await writer.write({ hasLatex: aggregateHasLatex });

    return {
      content,
      hasLatex: aggregateHasLatex,
      usage: aggregateUsage(sectionResults, outline.usage),
    };
  },
};

/**
 * Bounded-concurrency map. Workers pull from a shared index queue and
 * never reject — instead the FIRST error is captured, an abort flag is
 * set, and remaining workers exit cleanly once their current item
 * settles. Only after every worker has returned do we surface the
 * captured error.
 *
 * This shape matters because each `fn(item)` here writes to the
 * workflow's stream writer. If we used a plain `Promise.all`, a single
 * worker rejection would unblock the caller, whose `finally` releases
 * the writer lock — and any in-flight workers that subsequently call
 * `writer.write(...)` would throw synchronously into nothing, surfacing
 * as unhandled promise rejections (and on Node ≥15's default
 * `--unhandled-rejections=throw`, killing the function before the
 * workflow's error-recovery path runs).
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let aborted = false;
  let firstError: unknown = null;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!aborted) {
      const idx = next++;
      if (idx >= items.length) {
        return;
      }
      try {
        results[idx] = await fn(items[idx]);
      } catch (err) {
        if (firstError == null) {
          firstError = err;
        }
        aborted = true;
        return;
      }
    }
  });

  await Promise.all(workers);
  if (firstError != null) {
    throw firstError;
  }
  return results;
}

function firstWords(text: string, n: number): string {
  const tokens = text.trim().split(/\s+/);
  if (tokens.length <= n) {
    return text.trim();
  }
  return tokens.slice(0, n).join(' ') + '…';
}

function aggregateUsage(sections: SectionResult[], reduceUsage: unknown): unknown {
  const totals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let any = false;
  const consider = (u: unknown) => {
    if (u == null || typeof u !== 'object') {
      return;
    }
    const o = u as Record<string, unknown>;
    if (typeof o.inputTokens === 'number') {
      totals.inputTokens += o.inputTokens;
      any = true;
    }
    if (typeof o.outputTokens === 'number') {
      totals.outputTokens += o.outputTokens;
      any = true;
    }
    if (typeof o.totalTokens === 'number') {
      totals.totalTokens += o.totalTokens;
      any = true;
    }
  };
  for (const s of sections) {
    consider(s.usage);
  }
  consider(reduceUsage);
  return any ? totals : null;
}

/**
 * If the embedding pipeline fails, fall back to coalescing windows
 * into sections by word count alone — the chunker already snaps to
 * segment boundaries, so we just merge consecutive windows until the
 * accumulated word count crosses the section target. Logs its own
 * summary so log readers see the fallback path was taken (no distance
 * stats / cosine cuts in this branch).
 */
function fallbackSectionsFromWindows(windows: TranscriptChunk[]): TopicSection[] {
  // Re-chunk via the deterministic word-count chunker by feeding
  // windows back in as if they were segments — but at the section
  // target this time. We synthesise minimal segments from windows so
  // the chunker can group them.
  const synthSegments = windows.map((w) => ({
    startMs: w.startMs,
    endMs: w.endMs,
    text: w.text,
  }));
  const grouped = chunkTranscript(synthSegments, {
    targetWords: SECTION_TARGET_WORDS,
    maxChunks: MAX_SECTIONS,
  });
  const sections: TopicSection[] = grouped.map((c, idx) => ({
    index: idx,
    startMs: c.startMs,
    endMs: c.endMs,
    text: c.text,
    windowRange: { start: 0, end: 0 },
    cutReason: 'fallback',
  }));

  console.info('[articleWorkflow:map-reduce] section grouping summary (fallback)', {
    windows: windows.length,
    totalWords: windows.reduce((acc, w) => acc + countWords(w.text), 0),
    sections: sections.length,
    bounds: { target: SECTION_TARGET_WORDS },
    note: 'embedding pipeline failed; sections derived from word-count chunker',
    perSection: sections.map((s) => ({
      idx: s.index,
      words: countWords(s.text),
    })),
  });

  return sections;
}
