import { prisma } from '@readtube/database';
import { notFound } from 'next/navigation';

import Footer from '@/components/Footer';
import Header from '@/components/Header';
import VideoReader from '@/components/reader/VideoReader';
import { decorateVideo } from '@/lib/inbox/triage';
import type { VideoData } from '@/lib/types';

interface Props {
  params: Promise<{ handle: string; videoId: string }>;
}

export default async function PublicVideoPage({ params }: Props) {
  const { handle, videoId } = await params;

  // The first URL segment can be either a YouTube handle (`@mkbhd`,
  // arriving percent-encoded as `%40mkbhd`) or a raw channel id
  // (`UCxxx...`) when the channel row doesn't have a handle yet.
  // Handles in the DB are stored inconsistently — some rows include
  // the leading `@`, some don't — so match both forms.
  const decoded = decodeURIComponent(handle);
  const bare = decoded.startsWith('@') ? decoded.slice(1) : decoded;
  const handleCandidates = [`@${bare}`, bare];

  const channel = await prisma.channel.findFirst({
    where: {
      OR: [{ handle: { in: handleCandidates } }, { source_id: decoded }],
    },
    select: { id: true },
  });
  if (channel == null) {
    notFound();
  }

  const video = await prisma.video.findFirst({
    where: { channel_id: channel.id, source_id: videoId },
    select: {
      id: true,
      source_id: true,
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
          summary: { select: { transcript_id: true } },
          articles: { take: 1, select: { id: true } },
        },
      },
    },
  });
  if (video == null) {
    notFound();
  }

  const latest = video.transcripts[0];
  const hasSummary = latest?.summary != null;
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
      tagsByVideoId: new Map(),
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
