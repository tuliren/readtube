import { prisma } from '@readtube/database';
import { notFound, redirect } from 'next/navigation';

import { videoHref } from '@/lib/urls/videoHref';

interface Props {
  params: Promise<{ videoId: string }>;
}

/**
 * Legacy redirect: `/inbox/<internalId>` → `/videos/<sourceId>`.
 * The canonical video URL uses the platform `source_id` (see
 * `/videos/[videoId]`). Kept for bookmarks and stray links that still
 * reference the internal cuid form.
 */
export default async function LegacyVideoRedirect({ params }: Props) {
  const { videoId } = await params;
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { source_id: true },
  });
  if (video == null) {
    notFound();
  }
  redirect(videoHref({ sourceId: video.source_id }));
}
