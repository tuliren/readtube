import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import LibraryListView from '@/components/library/LibraryListView';
import { loadLibraryVideos } from '@/lib/library/loadVideos';

interface Props {
  params: Promise<{ id: string }>;
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
 * playlist doesn't exist or isn't owned by the viewer.
 */
export default async function PlaylistPage({ params }: Props) {
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

  const videos = await loadLibraryVideos(prisma, userId, { kind: 'playlist', playlistId: id });

  const hasCustom = playlist.custom_name != null && playlist.custom_name.length > 0;
  const title = hasCustom ? `${playlist.custom_name} (${playlist.name})` : playlist.name;

  return (
    <LibraryListView
      title={title}
      videos={videos}
      youtubeUrl={`https://www.youtube.com/playlist?list=${playlist.source_id}`}
      playlistId={playlist.id}
    />
  );
}
