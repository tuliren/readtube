import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { redirect } from 'next/navigation';

import LibraryListView from '@/components/library/LibraryListView';
import LibraryEmptyState from '@/components/library/LibraryVideoList';
import { loadLibraryVideos } from '@/lib/library/loadVideos';

/**
 * /videos — "All" entry under the Videos sidebar section. Shows every
 * video the user has a StandaloneVideo row for (including those in
 * playlists). Pure SSR for the initial paint; no SWR fallback yet.
 */
export default async function VideosAllPage() {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }

  const videos = await loadLibraryVideos(prisma, userId, { kind: 'all' });

  if (videos.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <LibraryEmptyState emptyMessage="Add a YouTube video or playlist to get started." />
      </div>
    );
  }

  return <LibraryListView title="All videos" videos={videos} />;
}
