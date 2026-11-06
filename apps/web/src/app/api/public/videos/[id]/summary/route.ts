import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { parseShareLanguage, resolveShareRow } from '@/lib/language/publicShare';
import { publicSummaryWhere } from '@/lib/videos/publicShareRows';

/**
 * Sharing-intent gate: the public video page only renders when a
 * cached Summary or Article exists, so the public API routes apply
 * the same gate. A video without either artifact is treated as 404
 * even if the internal UUID is guessed correctly.
 *
 * Honors `?language=<bcp47>` and `?language=original`: the named row
 * wins when it exists, otherwise `resolveShareRow` falls back to
 * English → Original → earliest. Missing / unknown codes name no
 * language and start at English — never empty when some version
 * exists. We intentionally do NOT cross-check against
 * `User.preferred_language` here — public visitors have no signed-in
 * user, and the URL is the only authoritative selection.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requested = parseShareLanguage(request.nextUrl.searchParams.get('language'));

  console.info(
    `[public/summary/GET] Fetching public summary for video ${id} (language=${requested === undefined ? 'default' : (requested ?? 'original')})`
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
          // `status: READY` filters out in-flight workflow rows so a
          // public visitor never lands on an empty page mid-generation.
          summaries: {
            where: { status: 'READY' },
            take: 1,
            select: { transcript_id: true },
          },
          articles: {
            where: { status: 'READY' },
            take: 1,
            select: { id: true },
          },
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

  // Every lookup filters on `status = READY` so an in-flight row never
  // surfaces, and on complete fields so an incomplete row can't shadow
  // a complete sibling during the share-language fallback.
  const findByLanguage = (language: string | null) =>
    prisma.summary.findFirst({
      where: publicSummaryWhere(transcript.id, language),
      ...fields,
    });

  const summary = await resolveShareRow(requested, findByLanguage, () =>
    prisma.summary.findFirst({
      where: publicSummaryWhere(transcript.id),
      orderBy: { generated_at: 'asc' },
      ...fields,
    })
  );
  if (!summary) {
    console.info(`[public/summary/GET] No cached summary for video ${id}`);
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
