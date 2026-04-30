import type { Article, ArticleStyle, PrismaClient, Summary } from '@readtube/database';
import { Prisma } from '@readtube/database';

import { detectLanguage } from './detect';
import { languageTagsMatch } from './names';

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Resolve the transcript's source language, detecting it on demand
 * the first time someone needs to know. Detection runs against the
 * transcript text (the most reliable signal — way more text than any
 * single summary or article body) and the result is cached on
 * `Transcript.language` so future requests skip the work.
 *
 * Returns null only when even franc can't decide ("und") — the caller
 * should treat that as "we don't know what this is in" and not try
 * to clone-from-Original.
 */
export async function resolveTranscriptLanguage(
  prisma: PrismaClient,
  transcriptId: string
): Promise<string | null> {
  const transcript = await prisma.transcript.findUnique({
    where: { id: transcriptId },
    select: { language: true, text: true },
  });
  if (transcript == null) {
    return null;
  }
  if (transcript.language != null) {
    return transcript.language;
  }
  const detected = detectLanguage(transcript.text);
  if (detected == null) {
    return null;
  }
  // Best-effort persist so future requests skip detection. Concurrent
  // writers all converge on the same detected value, so any race here
  // resolves cleanly without retry logic.
  try {
    await prisma.transcript.update({
      where: { id: transcriptId },
      data: { language: detected },
    });
  } catch {
    // Ignore — writing the cache is an optimization, not a guarantee.
  }
  return detected;
}

/**
 * Look up a cached Summary for `(transcript_id, language=target)`.
 *
 * - Direct hit: return it.
 * - Target requested AND no direct hit: if the Original
 *   (`language IS NULL`) row happens to already be in the target
 *   language (per the transcript's detected source language), CLONE
 *   the Original into a new row with `language=target` and return
 *   the clone. The Original stays untouched so picking "Original"
 *   later still finds it.
 * - Otherwise return null and let the caller generate fresh content.
 *
 * Why clone instead of returning Original-as-target: keeping the
 * `language IS NULL` row addressable matters — the picker shows
 * "Original" as a first-class option and the user can flip back to
 * it any time. Mutating Original by stamping a language code
 * would erase it from the Original lookup.
 */
export async function findOrCloneSummary(
  prisma: PrismaClient,
  transcriptId: string,
  target: string | null
): Promise<Summary | null> {
  const direct = await prisma.summary.findFirst({
    where: { transcript_id: transcriptId, language: target },
  });
  if (direct != null) {
    return direct;
  }

  if (target === null) {
    // Original was asked for explicitly. No fallback.
    return null;
  }

  const original = await prisma.summary.findFirst({
    where: { transcript_id: transcriptId, language: null },
  });
  if (original == null) {
    return null;
  }

  const sourceLanguage = await resolveTranscriptLanguage(prisma, transcriptId);
  // languageTagsMatch handles cross-form comparison: YouTube transcripts
  // come tagged as BCP-47 region/script forms (`zh-Hans`, `zh-CN`,
  // `fr-CA`), franc returns ISO 639-3 (`cmn`, `eng`), and the picker
  // sends curated codes (`zh-Hans`, `zh-Hant`, `en`). It also handles
  // ambiguous Chinese (a `zh` tag with no script signal matches either
  // Simplified or Traditional).
  if (sourceLanguage == null || !languageTagsMatch(sourceLanguage, target)) {
    return null;
  }

  // Clone the Original into a new (transcript_id, language=target)
  // row, byte-for-byte. The Original row is untouched.
  const cloneData = {
    transcript_id: original.transcript_id,
    language: target,
    headline: original.headline,
    short: original.short,
    full: original.full,
    prompt_version: original.prompt_version,
    model: original.model,
    usage: original.usage as Prisma.InputJsonValue,
  };
  try {
    return await prisma.summary.create({ data: cloneData });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return prisma.summary.findFirst({
        where: { transcript_id: transcriptId, language: target },
      });
    }
    throw err;
  }
}

/**
 * Article variant of {@link findOrCloneSummary}. Same semantics; the
 * cache key includes `style`.
 */
export async function findOrCloneArticle(
  prisma: PrismaClient,
  transcriptId: string,
  style: ArticleStyle,
  target: string | null
): Promise<Article | null> {
  const direct = await prisma.article.findFirst({
    where: { transcript_id: transcriptId, style, language: target },
  });
  if (direct != null) {
    return direct;
  }

  if (target === null) {
    return null;
  }

  const original = await prisma.article.findFirst({
    where: { transcript_id: transcriptId, style, language: null },
  });
  if (original == null) {
    return null;
  }

  const sourceLanguage = await resolveTranscriptLanguage(prisma, transcriptId);
  // languageTagsMatch handles cross-form comparison: YouTube transcripts
  // come tagged as BCP-47 region/script forms (`zh-Hans`, `zh-CN`,
  // `fr-CA`), franc returns ISO 639-3 (`cmn`, `eng`), and the picker
  // sends curated codes (`zh-Hans`, `zh-Hant`, `en`). It also handles
  // ambiguous Chinese (a `zh` tag with no script signal matches either
  // Simplified or Traditional).
  if (sourceLanguage == null || !languageTagsMatch(sourceLanguage, target)) {
    return null;
  }

  const cloneData = {
    transcript_id: original.transcript_id,
    style: original.style,
    language: target,
    content: original.content,
    prompt_version: original.prompt_version,
    model: original.model,
    usage: original.usage as Prisma.InputJsonValue,
  };
  try {
    return await prisma.article.create({ data: cloneData });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return prisma.article.findFirst({
        where: { transcript_id: transcriptId, style, language: target },
      });
    }
    throw err;
  }
}
