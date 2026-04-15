import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import VideoReader from '@/components/reader/VideoReader';
import { decorateVideo, loadTriageContext } from '@/lib/inbox/triage';
import type { VideoData } from '@/lib/types';
import { resolveVideoSourceId } from '@/lib/videos/resolveVideoSourceId';

interface Props {
  params: Promise<{ videoId: string }>;
}

const TITLE_CAP = 60;

function capTitle(title: string): string {
  if (title.length <= TITLE_CAP) {
    return title;
  }
  return `${title.slice(0, TITLE_CAP - 1).trimEnd()}…`;
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
  return { title: capTitle(video.title) };
}

/**
 * Authenticated video reader. Auth is enforced centrally by
 * `proxy.ts`, which protects every non-public route. The dashboard
 * layout owns the sidebar, so this page just renders the reader.
 *
 * Access control: the `findFirst` below joins through
 * `channel.subscriptions` so a logged-in user who isn't subscribed
 * to the channel gets a 404 (IDOR guard).
 */
export default async function VideoPage({ params }: Props) {
  const { videoId } = await params;
  const { userId } = await auth();
  // Middleware (`proxy.ts`) guarantees an authenticated session by
  // the time this runs; the null check is purely a type narrow.
  if (userId == null) {
    redirect('/');
  }

  const stub = await resolveVideoSourceId(prisma, videoId);
  if (stub == null) {
    notFound();
  }

  const video = await prisma.video.findFirst({
    where: { id: stub.id, channel: { subscriptions: { some: { user_id: userId } } } },
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
      consumptions: {
        where: { user_id: userId },
        select: { read_at: true },
        take: 1,
      },
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

  await prisma.userVideoConsumption.upsert({
    where: {
      user_video_consumption_unique_user_video: { user_id: userId, video_id: video.id },
    },
    create: { user_id: userId, video_id: video.id },
    update: {},
  });

  const existingReadAt = video.consumptions[0]?.read_at;
  const readerTriage = await loadTriageContext(prisma, userId, [video.id]);
  const videoData: VideoData = decorateVideo(video, readerTriage, existingReadAt ?? new Date());

  return (
    <div className="flex flex-1 overflow-hidden">
      <VideoReader video={videoData} />
    </div>
  );
}
