import type { PrismaClient } from '@readtube/database';

import type { VideoData } from '@/lib/types';

import { decorateVideo, loadTriageContext } from '../inbox/triage';

/**
 * Raw Video select shared by every library loader. Mirrors the shape
 * `decorateVideo` expects from the inbox triage helpers so we can
 * reuse the same decoration pipeline.
 */
const VIDEO_SELECT = {
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
    take: 1,
    orderBy: { created_at: 'desc' as const },
    select: {
      summary: { select: { transcript_id: true } },
      articles: { select: { id: true }, take: 1 },
    },
  },
} as const;

export type LibraryScope =
  | { kind: 'all' }
  | { kind: 'standalone' }
  | { kind: 'playlist'; playlistId: string };

/**
 * Load the user's library videos for a given scope:
 *   - all        → every video with a StandaloneVideo row for this user
 *   - standalone → StandaloneVideo rows with no matching PlaylistVideo
 *   - playlist   → videos in the given playlist (must belong to the user)
 *
 * Returns an empty array when the playlist doesn't exist or isn't
 * owned by the user. The caller decides whether to 404 or render empty.
 */
export async function loadLibraryVideos(
  prisma: PrismaClient,
  userId: string,
  scope: LibraryScope
): Promise<VideoData[]> {
  let videoIds: string[] = [];
  let playlistReadAt: Date | null = null;

  if (scope.kind === 'all') {
    const rows = await prisma.standaloneVideo.findMany({
      where: { user_id: userId },
      select: { video_id: true },
      orderBy: { created_at: 'desc' },
    });
    videoIds = rows.map((r) => r.video_id);
  } else if (scope.kind === 'standalone') {
    // PlaylistVideo is a global junction — scope the "none" check to
    // THIS user's playlists so another user filing the same video
    // into their playlist doesn't kick it out of our Standalone view.
    const rows = await prisma.standaloneVideo.findMany({
      where: {
        user_id: userId,
        video: { playlist_items: { none: { playlist: { user_id: userId } } } },
      },
      select: { video_id: true },
      orderBy: { created_at: 'desc' },
    });
    videoIds = rows.map((r) => r.video_id);
  } else {
    const playlist = await prisma.playlist.findFirst({
      where: { id: scope.playlistId, user_id: userId },
      select: { id: true, read_at: true },
    });
    if (playlist == null) {
      return [];
    }
    playlistReadAt = playlist.read_at;
    const rows = await prisma.playlistVideo.findMany({
      where: { playlist_id: scope.playlistId },
      select: { video_id: true },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'desc' }],
    });
    videoIds = rows.map((r) => r.video_id);
  }

  if (videoIds.length === 0) {
    return [];
  }

  // Fetch the Video rows. Preserve the id order we computed above so
  // the UI matches StandaloneVideo/PlaylistVideo insertion order.
  const videos = await prisma.video.findMany({
    where: { id: { in: videoIds } },
    select: VIDEO_SELECT,
  });
  const byId = new Map(videos.map((v) => [v.id, v]));

  const triage = await loadTriageContext(prisma, userId, videoIds);

  // Per-video consumption rows for explicit reads (user opened video).
  const consumptions = await prisma.userVideoConsumption.findMany({
    where: { user_id: userId, video_id: { in: videoIds } },
    select: { video_id: true, read_at: true },
  });
  const consumptionByVideoId = new Map(consumptions.map((c) => [c.video_id, c.read_at]));

  const decorated: VideoData[] = [];
  for (const id of videoIds) {
    const row = byId.get(id);
    if (row == null) {
      continue;
    }
    // Read state: explicit consumption wins, then playlist watermark.
    const explicitRead = consumptionByVideoId.get(id) ?? null;
    let readAt: Date | null = explicitRead;
    if (readAt == null && playlistReadAt != null && row.published_at <= playlistReadAt) {
      readAt = playlistReadAt;
    }
    decorated.push(decorateVideo(row, triage, readAt));
  }
  return decorated;
}
