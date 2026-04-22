import { prisma } from '@readtube/database';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import VideoReader from '@/components/reader/VideoReader';
import { capTitle } from '@/lib/format/title';
import { decorateVideo } from '@/lib/inbox/triage';
import type { VideoData } from '@/lib/types';
import { resolveVideoSourceId } from '@/lib/videos/resolveVideoSourceId';

interface Props {
  params: Promise<{ videoId: string }>;
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
export default async function PublicVideoPage({ params }: Props) {
  const { videoId } = await params;

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
          summaries: { take: 1, select: { transcript_id: true } },
          articles: { take: 1, select: { id: true } },
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

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 flex-col">
        <VideoReader video={videoData} publicMode />
      </main>
      <Footer />
    </div>
  );
}
