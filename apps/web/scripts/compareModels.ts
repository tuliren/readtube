/**
 * Dev CLI that generates a video's summary with two AI Gateway models
 * and shows the results side by side — for evaluating a candidate
 * `DEFAULT_AI_MODEL` before switching to it.
 *
 * Reads the video's latest stored transcript from the database (nothing
 * is written back), builds the production summary prompt + schema, and
 * runs both models in parallel. Prints a latency / token / cost table
 * and writes a side-by-side HTML report to `scripts/output/`, which it
 * opens on macOS.
 *
 * Model slugs are AI Gateway ids (`provider/model`), e.g. the current
 * `DEFAULT_AI_MODEL`. Requires `AI_GATEWAY_API_KEY` and `DATABASE_URL`.
 *
 * Usage:
 *   yarn script scripts/compareModels.ts <videoId> <modelA> <modelB> [--lang ja] [--platform BILIBILI]
 *   yarn script:prod scripts/compareModels.ts <videoId> <modelA> <modelB>
 *
 * <videoId> is the platform's own id (`Video.source_id`), not the DB id.
 * --lang sets the target language (BCP-47); omitted means the
 * transcript's original language, like the app's "Original" option.
 */
import { VideoPlatformType, prisma } from '@readtube/database';
import { generateObject } from 'ai';
import { execFile } from 'child_process';
import { program } from 'commander';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { TRANSCRIPT_GENERATION_TIMEOUT_MS } from '@/constants';
import {
  type ModelRun,
  buildStatsRows,
  renderComparisonHtml,
  sectionContent,
} from '@/lib/ai/modelComparison';
import { detectLanguage } from '@/lib/language/detect';
import type { TranscriptSegment } from '@/lib/platforms/types';
import { buildSummaryPrompt } from '@/lib/workflows/summary/buildPrompt';
import { SUMMARY_FIELDS } from '@/lib/workflows/summary/promptSections';
import { type SummaryObject, buildSummarySchema } from '@/lib/workflows/summary/schema';

const OUTPUT_DIR = path.join(__dirname, 'output');

/** The gateway reports per-request cost in provider metadata; it may
 *  arrive as a number or a numeric string. */
function extractGatewayCost(providerMetadata: unknown): number | null {
  const cost = (providerMetadata as { gateway?: { cost?: unknown } } | undefined)?.gateway?.cost;
  const parsed = typeof cost === 'string' ? Number(cost) : cost;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

async function runModel(model: string, prompt: string): Promise<ModelRun> {
  const startedAt = Date.now();
  try {
    const result = await generateObject({
      model,
      schema: buildSummarySchema(SUMMARY_FIELDS),
      prompt,
      abortSignal: AbortSignal.timeout(TRANSCRIPT_GENERATION_TIMEOUT_MS),
    });
    return {
      model,
      ok: true,
      summary: result.object as SummaryObject,
      stats: {
        latencyMs: Date.now() - startedAt,
        inputTokens: result.usage.inputTokens ?? null,
        outputTokens: result.usage.outputTokens ?? null,
        reasoningTokens: result.usage.reasoningTokens ?? null,
        costUsd: extractGatewayCost(result.providerMetadata),
      },
    };
  } catch (err) {
    return {
      model,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function main(): Promise<void> {
  program
    .argument('<videoId>', 'platform video id (Video.source_id)')
    .argument('<modelA>', 'AI Gateway model slug, e.g. openai/gpt-6-luna')
    .argument('<modelB>', 'AI Gateway model slug to compare against')
    .option('--lang <code>', 'target language (BCP-47); defaults to the original language')
    .option('--platform <platform>', 'video platform', VideoPlatformType.YOUTUBE)
    .option('--no-open', 'do not open the HTML report')
    .parse();
  const [videoId, modelA, modelB] = program.args;
  const opts = program.opts<{ lang?: string; platform: string; open: boolean }>();

  const platform = opts.platform.toUpperCase();
  if (!Object.values<string>(VideoPlatformType).includes(platform)) {
    throw new Error(`Unknown platform "${opts.platform}".`);
  }

  const video = await prisma.video.findUnique({
    where: {
      video_unique_source: { source_type: platform as VideoPlatformType, source_id: videoId },
    },
    select: {
      title: true,
      channel: { select: { name: true } },
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { text: true, language: true },
      },
    },
  });
  if (video == null) {
    throw new Error(`No ${platform} video with id ${videoId} in the database.`);
  }
  const transcript = video.transcripts[0];
  if (transcript == null) {
    throw new Error(`Video ${videoId} has no stored transcript.`);
  }

  const segments = JSON.parse(transcript.text) as TranscriptSegment[];
  const transcriptText = segments.map((s) => s.text).join(' ');
  const target = opts.lang ?? null;
  // Mirrors resolveTranscriptLanguage without its cache write-back, so
  // this script stays read-only.
  const sourceLanguage =
    target == null ? (transcript.language ?? detectLanguage(transcript.text)) : null;
  const prompt = buildSummaryPrompt(
    SUMMARY_FIELDS,
    target,
    sourceLanguage,
    video.title,
    video.channel.name,
    transcriptText
  );

  console.log(`Video:      ${video.title} (${video.channel.name})`);
  console.log(`Transcript: ${transcriptText.length.toLocaleString('en-US')} chars`);
  console.log(`Language:   ${target ?? `original (${sourceLanguage ?? 'unknown'})`}`);
  console.log(`Generating with ${modelA} and ${modelB} …\n`);

  const runs = await Promise.all([runModel(modelA, prompt), runModel(modelB, prompt)]);

  console.table(
    Object.fromEntries(
      buildStatsRows(runs).map((row) => [
        row.metric,
        { [modelA]: row.values[0], [modelB]: row.values[1] },
      ])
    )
  );
  for (const run of runs) {
    if (run.ok) {
      console.log(`\n[${run.model}] ${sectionContent(run.summary, 'headline')}`);
    } else {
      console.error(`\n[${run.model}] FAILED: ${run.error}`);
    }
  }

  const html = renderComparisonHtml({
    videoTitle: video.title,
    channelName: video.channel.name,
    sourceId: videoId,
    language: target,
    transcriptChars: transcriptText.length,
    generatedAt: new Date(),
    runs,
  });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const slug = (model: string) => model.replace(/[^a-zA-Z0-9.-]+/g, '_');
  const outputPath = path.join(
    OUTPUT_DIR,
    `compare-${videoId}-${slug(modelA)}-vs-${slug(modelB)}-${Date.now()}.html`
  );
  writeFileSync(outputPath, html);
  console.log(`\nReport: ${outputPath}`);
  if (opts.open && process.platform === 'darwin') {
    execFile('open', [outputPath]);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
