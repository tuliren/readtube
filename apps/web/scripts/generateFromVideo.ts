/**
 * Dev CLI that runs the full AI pipeline for a YouTube video and prints
 * the transcript stats, title, summary, and article — the same path the
 * app takes for a caption-less video, without the DB/workflow/UI. Handy
 * for previewing what a given video will produce and for debugging the
 * chunked video-transcription flow.
 *
 * Pipeline (mirrors production):
 *   1. TRANSCRIPT — native Gemini video understanding, chunked into
 *      `TRANSCRIPT_GENERATION_CHUNK_SECONDS` windows and stitched
 *      (`lib/ai/geminiVideo.ts` + `lib/transcripts/transcriptWindows.ts`).
 *      Prints per-window VIDEO-token counts so you can see ingestion.
 *   2. SUMMARY + ARTICLE — generated FROM the transcript text via the AI
 *      Gateway (`DEFAULT_AI_MODEL`), using the production prompts. The
 *      article uses the single-pass prompt regardless of length (the app
 *      switches to map-reduce for long videos; this is a preview).
 *
 * Requires `GEMINI_API_KEY` (transcript) and `AI_GATEWAY_API_KEY`
 * (summary/article) in `.env.development`.
 *
 * Usage:
 *   yarn script scripts/generateFromVideo.ts --url <youtube-url> [--lang zh-Hans]
 *   yarn script scripts/generateFromVideo.ts --id <videoId> [--lang zh-Hans]
 *
 * --lang forces the output/source language (BCP-47); when omitted it is
 * detected from the transcript.
 */
import { ArticleStyle } from '@readtube/database';
import { generateObject, generateText } from 'ai';
import { program } from 'commander';
import { z } from 'zod';

import {
  DEFAULT_AI_MODEL,
  TRANSCRIPT_GENERATION_CHUNK_SECONDS,
  TRANSCRIPT_GENERATION_MAX_OUTPUT_TOKENS,
  TRANSCRIPT_GENERATION_TIMEOUT_MS,
} from '@/constants';
import { generateFromVideoWindow } from '@/lib/ai/geminiVideo';
import { detectLanguage } from '@/lib/language/detect';
import type { TranscriptSegment } from '@/lib/platforms/types';
import { fetchVideoViaDataApi } from '@/lib/platforms/youtube/dataApi';
import { extractVideoId } from '@/lib/platforms/youtube/videoSnapshot';
import { parseGeneratedTranscript } from '@/lib/transcripts/parseGeneratedTranscript';
import {
  normalizeWindowTimestamps,
  planTranscriptWindows,
  stitchWindowSegments,
} from '@/lib/transcripts/transcriptWindows';
import { buildSinglePassPrompt } from '@/lib/workflows/article/strategies/prompts';
import { buildSummaryPrompt } from '@/lib/workflows/summary/buildPrompt';
import { SECTION_BODIES, SUMMARY_FIELDS } from '@/lib/workflows/summary/promptSections';
import { buildTranscriptGenerationPrompt } from '@/lib/workflows/transcript-generation/prompt';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

const summarySchema = z.object({
  headline: z.string().describe(SECTION_BODIES.headline),
  full: z.object({ content: z.string().describe(SECTION_BODIES.full), hasLatex: z.boolean() }),
  short: z.object({ content: z.string().describe(SECTION_BODIES.short), hasLatex: z.boolean() }),
});

function divider(label: string): void {
  console.log(`\n${'='.repeat(72)}\n${label}\n${'='.repeat(72)}`);
}

/** Transcribe the whole video with the production chunked native path. */
async function transcribeVideo(
  videoUrl: string,
  durationSeconds: number
): Promise<TranscriptSegment[]> {
  const windows = planTranscriptWindows(durationSeconds, TRANSCRIPT_GENERATION_CHUNK_SECONDS);
  console.log(`Transcribing in ${windows.length} window(s)…`);
  const perWindow = await Promise.all(
    windows.map(async (window) => {
      const result = await generateFromVideoWindow({
        prompt: buildTranscriptGenerationPrompt(),
        videoUrl,
        startOffsetSec: window.startSec,
        endOffsetSec: window.endSec,
        maxOutputTokens: TRANSCRIPT_GENERATION_MAX_OUTPUT_TOKENS,
        signal: AbortSignal.timeout(TRANSCRIPT_GENERATION_TIMEOUT_MS),
      });
      // Mirror the production step: a content-policy block yields an empty
      // response with a blockReason, so skip the window and keep the rest.
      if (result.blockReason != null) {
        console.log(
          `  window ${window.startSec}-${window.endSec}s: BLOCKED (${result.blockReason}), skipping`
        );
        return [] as TranscriptSegment[];
      }
      const segments = normalizeWindowTimestamps(
        parseGeneratedTranscript(result.text, { durationMs: null }),
        window
      );
      console.log(
        `  window ${window.startSec}-${window.endSec}s: videoTokens=${result.usage.videoTokens}, ` +
          `finish=${result.finishReason}, segments=${segments.length}`
      );
      return segments;
    })
  );
  return stitchWindowSegments(perWindow, durationSeconds);
}

async function main(): Promise<void> {
  program
    .option('--url <url>', 'YouTube watch URL')
    .option('--id <id>', 'YouTube video id')
    .option('--lang <code>', 'Output/source language (BCP-47, e.g. zh-Hans)')
    .parse();
  const opts = program.opts<{ url?: string; id?: string; lang?: string }>();

  const videoId = opts.id ?? (opts.url != null ? extractVideoId(opts.url) : null);
  if (videoId == null) {
    console.error('Provide a video via --url <youtube-url> or --id <videoId>.');
    process.exit(1);
  }

  console.log(`Fetching video metadata for ${videoId} …`);
  const snapshot = await fetchVideoViaDataApi(videoId);
  const { title } = snapshot;
  const channelName = snapshot.channel.name;
  const durationSeconds = snapshot.durationSeconds;
  if (durationSeconds == null) {
    console.error('Video duration is unknown; cannot plan transcription windows.');
    process.exit(1);
  }
  console.log(`Title:    ${title}`);
  console.log(`Channel:  ${channelName}`);
  console.log(`Duration: ${durationSeconds} s`);

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // --- Transcript ---
  divider('TRANSCRIPT (native Gemini, chunked)');
  const segments = await transcribeVideo(videoUrl, durationSeconds);
  const transcriptText = segments.map((s) => s.text).join(' ');
  const covered = segments.reduce((m, s) => Math.max(m, s.endMs), 0) / 1000;
  const sourceLanguage = opts.lang ?? detectLanguage(transcriptText) ?? null;
  console.log(
    `\nStitched: ${segments.length} segments, covered ${Math.round(covered)}s / ${durationSeconds}s ` +
      `(${((covered / durationSeconds) * 100).toFixed(1)}%), language=${sourceLanguage ?? 'unknown'}`
  );

  // --- Title + Summary (from the transcript) ---
  divider('TITLE + SUMMARY');
  const summary = await generateObject({
    model: DEFAULT_AI_MODEL,
    schema: summarySchema,
    prompt: buildSummaryPrompt(
      SUMMARY_FIELDS,
      null,
      sourceLanguage,
      title,
      channelName,
      transcriptText
    ),
    maxOutputTokens: 16_384,
    abortSignal: AbortSignal.timeout(TRANSCRIPT_GENERATION_TIMEOUT_MS),
  });
  console.log(`\nTITLE (headline):\n${summary.object.headline}`);
  console.log(`\nSHORT SUMMARY:\n${summary.object.short.content}`);
  console.log(`\nFULL SUMMARY:\n${summary.object.full.content}`);

  // --- Article (from the transcript) ---
  divider('ARTICLE (single-pass)');
  const article = await generateText({
    model: DEFAULT_AI_MODEL,
    prompt: buildSinglePassPrompt({
      transcriptId: '',
      style: ArticleStyle.NARRATIVE,
      language: null,
      sourceLanguage,
      segments,
      videoTitle: title,
      channelName,
      durationSeconds,
    }),
    maxOutputTokens: TRANSCRIPT_GENERATION_MAX_OUTPUT_TOKENS,
    abortSignal: AbortSignal.timeout(TRANSCRIPT_GENERATION_TIMEOUT_MS),
  });
  console.log(`\n${article.text}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
