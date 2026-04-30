import { prisma } from '@readtube/database';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import VideoReader from '@/components/reader/VideoReader';
import { capTitle } from '@/lib/format/title';
import { decorateVideo } from '@/lib/inbox/triage';
import { findTargetLanguage } from '@/lib/language/names';
import type { VideoData } from '@/lib/types';
import { resolveVideoSourceId } from '@/lib/videos/resolveVideoSourceId';

interface Props {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { videoId } = await params;
  const stub = await resolveVideoSourceId(prisma, videoId);
  if (stub == null) {
    return {};
  }
  const video = await prisma.video.findUnique({
    where: { id: stub.id },
    select: { title: true },
  });
  if (video == null) {
    return {};
  }
  // Root layout's title template appends " | ReadTube" automatically.
  return { title: capTitle(video.title) };
}

/**
 * Public, unauthenticated video reader. Always renders the stripped-
 * down view (no notes, no triage actions). 404s when the video has
 * neither a summary nor an article — there's nothing to read.
 * Accessible regardless of auth state so shared links work for
 * anyone with the URL.
 */
export default async function PublicVideoPage({ params, searchParams }: Props) {
  const { videoId } = await params;
  const sp = await searchParams;

  // ?language=<bcp47> selects which translated row to render. Unknown
  // codes are ignored so a tampered URL falls back to Original
  // instead of 404'ing the public share. Empty / missing means
  // Original. Arrays (Next.js allows ?language=a&language=b) take the
  // first value.
  const rawLang = Array.isArray(sp.language) ? sp.language[0] : sp.language;
  const requestedLanguage =
    rawLang != null && rawLang.length > 0 && findTargetLanguage(rawLang) != null ? rawLang : null;

  const stub = await resolveVideoSourceId(prisma, videoId);
  if (stub == null) {
    notFound();
  }

  const video = await prisma.video.findUnique({
    where: { id: stub.id },
    select: {
      id: true,
      source_id: true,
      source_type: true,
      title: true,
      description: true,
      published_at: true,
      duration_seconds: true,
      thumbnail_url: true,
      transcript_unavailable: true,
      channel_id: true,
      channel: { select: { name: true, source_id: true, handle: true } },
      transcripts: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: {
          // Filter on `status = READY`; the public share page must
          // 404 on a slot that only has an in-flight workflow row.
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
  if (video == null) {
    notFound();
  }

  const latest = video.transcripts[0];
  const hasSummary = (latest?.summaries.length ?? 0) > 0;
  const hasArticle = (latest?.articles.length ?? 0) > 0;
  if (!hasSummary && !hasArticle) {
    notFound();
  }

  const videoData: VideoData = decorateVideo(
    video,
    {
      starredIds: new Set(),
      savedIds: new Set(),
      archivedIds: new Set(),
      standaloneIds: new Set(),
      noteCountsByVideoId: new Map(),
    },
    null
  );

  // Fixed-viewport layout (matches the dashboard's `h-screen
  // overflow-hidden` shell) so VideoReader's internal `overflow-y-auto`
  // pane is the actual scroll container. Without the height bound the
  // page would scroll on `window` instead, breaking the floating TOC's
  // Top / Bottom shortcuts which target the cached scroll ancestor.
  // `min-h-0` on `<main>` is what lets the flex child shrink below its
  // content's intrinsic height — without it, `flex-1` would overflow
  // the viewport and the inner pane would never establish a scroll
  // container.
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header />
      <main className="flex min-h-0 flex-1 flex-col">
        <VideoReader
          video={videoData}
          publicMode
          preferredLanguage={requestedLanguage}
          footerSlot={<Footer compact />}
        />
      </main>
    </div>
  );
}
