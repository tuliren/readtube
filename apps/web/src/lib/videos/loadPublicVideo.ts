import type { PrismaClient } from '@readtube/database';

import { decorateVideo } from '@/lib/inbox/triage';
import type { VideoData } from '@/lib/types';

/**
 * Load a video for the public, read-only reader: the share page
 * (`/p/videos/...`) and the onboarding preview. Returns null when the
 * video doesn't exist or has neither a READY summary nor a READY
 * article, since there is nothing to read. Carries no user state: no
 * marks, no read watermark.
 */
export async function loadPublicVideo(
  prisma: PrismaClient,
  videoId: string
): Promise<VideoData | null> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
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
          // Only READY rows count: a slot that only has an in-flight
          // workflow row has nothing to read yet.
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
    return null;
  }

  const latest = video.transcripts[0];
  const hasSummary = (latest?.summaries.length ?? 0) > 0;
  const hasArticle = (latest?.articles.length ?? 0) > 0;
  if (!hasSummary && !hasArticle) {
    return null;
  }

  return decorateVideo(
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
}
