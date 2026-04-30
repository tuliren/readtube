import { prisma } from '@readtube/database';

import { detectLanguage } from '@/lib/language/detect';

/**
 * Idempotent, opportunistic backfill for the language column on
 * Transcript / Summary / Article. Not a prerequisite for the
 * add_language_to_summary_and_article migration — the API route
 * lazy-detects on the first request for each row that needs it.
 *
 * Running this script just front-loads that work so the first user
 * who picks a target language doesn't pay the franc cost.
 *
 * Order: Transcript first (its language is the canonical answer),
 * then propagate to Summary and Article. For rows whose Transcript
 * still has no language (franc returned 'und' on the transcript text,
 * or the transcript text is empty), fall back to detecting on the
 * row's own text.
 *
 * Re-running is safe: every step skips rows that already have a
 * non-null language.
 */

interface Counters {
  scanned: number;
  filled: number;
  skipped: number;
  unresolved: number;
}

function emptyCounters(): Counters {
  return { scanned: 0, filled: 0, skipped: 0, unresolved: 0 };
}

async function backfillTranscripts(): Promise<Counters> {
  const counters = emptyCounters();
  const transcripts = await prisma.transcript.findMany({
    where: { language: null },
    select: { id: true, text: true },
  });
  counters.scanned = transcripts.length;
  for (const t of transcripts) {
    const detected = detectLanguage(t.text);
    if (detected == null) {
      counters.unresolved++;
      continue;
    }
    await prisma.transcript.update({
      where: { id: t.id },
      data: { language: detected },
    });
    counters.filled++;
  }
  return counters;
}

async function backfillSummaries(): Promise<Counters> {
  const counters = emptyCounters();
  const summaries = await prisma.summary.findMany({
    where: { language: null },
    select: {
      id: true,
      headline: true,
      short: true,
      full: true,
      transcript: { select: { language: true, text: true } },
    },
  });
  counters.scanned = summaries.length;
  for (const s of summaries) {
    const fromTranscript = s.transcript?.language ?? null;
    if (fromTranscript != null) {
      await prisma.summary.update({
        where: { id: s.id },
        data: { language: fromTranscript },
      });
      counters.filled++;
      continue;
    }
    const text = s.full ?? s.short ?? s.headline ?? s.transcript?.text ?? '';
    const detected = detectLanguage(text);
    if (detected == null) {
      counters.unresolved++;
      continue;
    }
    await prisma.summary.update({
      where: { id: s.id },
      data: { language: detected },
    });
    counters.filled++;
  }
  return counters;
}

async function backfillArticles(): Promise<Counters> {
  const counters = emptyCounters();
  const articles = await prisma.article.findMany({
    where: { language: null },
    select: {
      id: true,
      content: true,
      transcript: { select: { language: true, text: true } },
    },
  });
  counters.scanned = articles.length;
  for (const a of articles) {
    const fromTranscript = a.transcript?.language ?? null;
    if (fromTranscript != null) {
      await prisma.article.update({
        where: { id: a.id },
        data: { language: fromTranscript },
      });
      counters.filled++;
      continue;
    }
    // a.content can be null after the GenerationStatus migration —
    // GENERATING rows have no content yet. Treat null and empty as
    // "fall back to transcript text."
    const articleText = a.content ?? '';
    const text = articleText.length > 0 ? articleText : (a.transcript?.text ?? '');
    const detected = detectLanguage(text);
    if (detected == null) {
      counters.unresolved++;
      continue;
    }
    await prisma.article.update({
      where: { id: a.id },
      data: { language: detected },
    });
    counters.filled++;
  }
  return counters;
}

function logCounters(label: string, c: Counters) {
  console.info(
    `[backfillLanguage] ${label}: scanned=${c.scanned} filled=${c.filled} unresolved=${c.unresolved}`
  );
}

(async () => {
  console.info('[backfillLanguage] starting');
  try {
    const transcripts = await backfillTranscripts();
    logCounters('transcripts', transcripts);
    const summaries = await backfillSummaries();
    logCounters('summaries', summaries);
    const articles = await backfillArticles();
    logCounters('articles', articles);
    console.info('[backfillLanguage] done');
  } catch (err) {
    console.error('[backfillLanguage] failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
