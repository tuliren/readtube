import { prisma } from '@readtube/database';
import { NextRequest, NextResponse } from 'next/server';

import { parseShareLanguage } from '@/lib/language/publicShare';
import { findPublicTranscript, loadPublicSummary } from '@/lib/videos/publicContent';

/**
 * Sharing-intent gate: the public video page only renders when a
 * cached Summary or Article exists, so the public API routes apply
 * the same gate (see `findPublicTranscript`). A video without either
 * artifact is treated as 404 even if the internal UUID is guessed
 * correctly.
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

  const { videoExists, transcriptId } = await findPublicTranscript(prisma, id);
  if (!videoExists) {
    console.error(`[public/summary/GET] Video ${id} not found`);
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }
  if (transcriptId == null) {
    console.error(`[public/summary/GET] Video ${id} has no public artifact`);
    return NextResponse.json({ error: 'Not public' }, { status: 404 });
  }

  const summary = await loadPublicSummary(prisma, transcriptId, requested);
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
