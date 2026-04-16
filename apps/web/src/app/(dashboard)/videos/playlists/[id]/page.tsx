import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { notFound, redirect } from 'next/navigation';

import LibraryListView from '@/components/library/LibraryListView';
import { loadLibraryVideos } from '@/lib/library/loadVideos';

interface Props {
  params: Promise<{ id: string }>;
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
    select: { id: true, name: true, source_id: true },
  });
  if (playlist == null) {
    notFound();
  }

  const videos = await loadLibraryVideos(prisma, userId, { kind: 'playlist', playlistId: id });

  return (
    <LibraryListView
      title={playlist.name}
      videos={videos}
      youtubeUrl={`https://www.youtube.com/playlist?list=${playlist.source_id}`}
    />
  );
}
