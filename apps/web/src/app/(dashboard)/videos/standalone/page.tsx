import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { redirect } from 'next/navigation';

import LibraryListView from '@/components/library/LibraryListView';
import LibraryVideoList from '@/components/library/LibraryVideoList';
import { loadLibraryVideos } from '@/lib/library/loadVideos';

/**
 * /videos/standalone — videos the user has added that aren't in any
 * playlist. A filtered view over StandaloneVideo rows.
 */
export default async function VideosStandalonePage() {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }

  const videos = await loadLibraryVideos(prisma, userId, { kind: 'standalone' });

  if (videos.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <LibraryVideoList
          videos={[]}
          emptyMessage="Add a YouTube video or playlist to get started."
          showAddActions
        />
      </div>
    );
  }

  return <LibraryListView title="Standalone" videos={videos} />;
}
