import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import ExternalLinkActions from '@/components/ExternalLinkActions';
import VideoListView from '@/components/inbox/VideoListView';
import { loadInboxVideos, searchParamsToInboxQuery } from '@/lib/inbox/loadVideos';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await auth();
  if (userId == null) {
    return {};
  }
  const { id } = await params;
  const playlist = await prisma.playlist.findFirst({
    where: { id, user_id: userId },
    select: { name: true, custom_name: true },
  });
  if (playlist == null) {
    return { title: 'Playlist' };
  }
  const display =
    playlist.custom_name != null && playlist.custom_name.length > 0
      ? `${playlist.custom_name} (${playlist.name})`
      : playlist.name;
  return { title: display };
}

/**
 * /videos/playlists/[id] — videos in the playlist. 404s if the
 * playlist doesn't exist or isn't owned by the viewer. Pagination
 * preserves playlist sort_order: the shared `VideoListView` talks to
 * `/api/videos?library=playlist&playlistId=…`, which routes to the
 * library branch of `loadInboxVideos`.
 */
export default async function PlaylistPage({ params, searchParams }: Props) {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }
  const { id } = await params;

  const playlist = await prisma.playlist.findFirst({
    where: { id, user_id: userId },
    select: { id: true, name: true, custom_name: true, source_id: true },
  });
  if (playlist == null) {
    notFound();
  }

  const baseQuery = searchParamsToInboxQuery(await searchParams);
  const query = {
    ...baseQuery,
    library: 'playlist' as const,
    playlistId: playlist.id,
  };
  const initial = await loadInboxVideos(prisma, userId, query);

  const hasCustom = playlist.custom_name != null && playlist.custom_name.length > 0;
  const title = hasCustom ? `${playlist.custom_name} (${playlist.name})` : playlist.name;
  const youtubeUrl = `https://www.youtube.com/playlist?list=${playlist.source_id}`;

  return (
    <VideoListView
      initialVideos={initial.videos}
      initialTotal={initial.total}
      selectedChannelId={null}
      selectedVideoId={null}
      library={{
        scope: { library: 'playlist', playlistId: playlist.id },
        title,
        emptyMessage: 'No videos in this playlist.',
        markAllReadBody: { playlistId: playlist.id },
        trailing: <ExternalLinkActions url={youtubeUrl} label="Open on YouTube" />,
      }}
      showRemoveFromLibrary
    />
  );
}
