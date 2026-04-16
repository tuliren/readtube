import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { notFound, redirect } from 'next/navigation';

import ExternalLinkActions from '@/components/ExternalLinkActions';
import LibraryVideoList from '@/components/library/LibraryVideoList';
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
  const youtubeUrl = `https://www.youtube.com/playlist?list=${playlist.source_id}`;

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-200 px-4">
        <h1 className="text-base font-semibold text-gray-900">{playlist.name}</h1>
        <ExternalLinkActions url={youtubeUrl} label="Open playlist on YouTube" />
      </header>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <LibraryVideoList
          videos={videos}
          emptyMessage="This playlist is empty. Add videos to it from any video's menu."
        />
      </div>
    </div>
  );
}
