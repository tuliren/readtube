import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { findTargetLanguage } from '@/lib/language/names';
import { parseLanguageQuery } from '@/lib/language/prompt';

/**
 * Sharing-intent gate: the public video page only renders when a
 * cached Summary or Article exists, so the public API routes apply
 * the same gate. A video without either artifact is treated as 404
 * even if the internal UUID is guessed correctly.
 *
 * Honors `?language=<bcp47>`. When set and a matching translated
 * Summary row exists, return it; otherwise fall back to the Original
 * (`language IS NULL`) row. Missing / `original` / unknown codes go
 * straight to Original. We intentionally do NOT cross-check against
 * `User.preferred_language` here — public visitors have no signed-in
 * user, and the URL is the only authoritative selection.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = parseLanguageQuery(request.nextUrl.searchParams.get('language'));
  // Validate against the curated picker list. Unknown codes silently
  // fall back to Original — a tampered URL should still render
  // something useful instead of leaking the raw code into a query.
  const targetLanguage =
    parsed.kind === 'target' && findTargetLanguage(parsed.code) != null ? parsed.code : null;

  console.info(
    `[public/summary/GET] Fetching public summary for video ${id} (language=${targetLanguage ?? 'original'})`
  );

  const video = await prisma.video.findFirst({
    where: { id },
    select: {
      id: true,
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: {
          id: true,
          // Gate on the existence of ANY summary or article row,
          // matching the public page's gate (see /p/videos/[videoId]
          // page.tsx). Keying on `language IS NULL` would 404 when the
          // user has only generated translated rows — translations
          // don't always derive from a pre-existing Original (the
          // user can pick a target language as their first
          // generation), so a missing Original isn't the same thing
          // as "no public artifact."
          summaries: { take: 1, select: { transcript_id: true } },
          articles: { take: 1, select: { id: true } },
        },
      },
    },
  });
  if (!video) {
    console.error(`[public/summary/GET] Video ${id} not found`);
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const transcript = video.transcripts[0];
  const hasAnyPublicArtifact =
    transcript != null && (transcript.summaries.length > 0 || transcript.articles.length > 0);
  if (!hasAnyPublicArtifact || transcript == null) {
    console.error(`[public/summary/GET] Video ${id} has no public artifact`);
    return NextResponse.json({ error: 'Not public' }, { status: 404 });
  }

  const fields = {
    select: { headline: true, short: true, full: true, language: true, generated_at: true },
  } as const;

  // When a target is requested, look it up directly. Fall back to
  // the Original on miss so a tampered or stale share URL renders
  // the canonical version instead of 404'ing.
  let summary = null;
  if (targetLanguage != null) {
    summary = await prisma.summary.findFirst({
      where: { transcript_id: transcript.id, language: targetLanguage },
      ...fields,
    });
  }
  if (summary == null) {
    summary = await prisma.summary.findFirst({
      where: { transcript_id: transcript.id, language: null },
      ...fields,
    });
  }
  if (!summary) {
    console.error(`[public/summary/GET] No cached summary for video ${id}`);
    return NextResponse.json({ error: 'Not cached' }, { status: 404 });
  }

  return NextResponse.json({
    headline: summary.headline,
    short: summary.short,
    full: summary.full,
    language: summary.language,
    generatedAt: summary.generated_at,
  });
}
