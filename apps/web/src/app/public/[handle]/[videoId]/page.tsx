import { redirect } from 'next/navigation';

import { videoHref } from '@/lib/urls/videoHref';

interface Props {
  params: Promise<{ handle: string; videoId: string }>;
}

/**
 * Legacy redirect: `/public/<handle>/<videoId>` → `/videos/<videoId>`.
 * The new `/videos/[videoId]` route serves both authenticated and
 * anonymous viewers (anonymous sees the public article/summary view
 * when available).
 */
export default async function LegacyPublicRedirect({ params }: Props) {
  const { videoId } = await params;
  redirect(videoHref({ sourceId: videoId }));
}
