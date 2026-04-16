import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { redirect } from 'next/navigation';

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

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-gray-200 px-4">
        <h1 className="text-base font-semibold text-gray-900">Standalone</h1>
      </header>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <LibraryVideoList
          videos={videos}
          emptyMessage="Add a YouTube video or playlist to get started."
          showAddActions
        />
      </div>
    </div>
  );
}
