import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import { redirect } from 'next/navigation';

import LibraryVideoList from '@/components/library/LibraryVideoList';
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

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-gray-200 px-4">
        <h1 className="text-base font-semibold text-gray-900">All videos</h1>
      </header>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <LibraryVideoList
          videos={videos}
          emptyMessage="You haven't added any videos yet. Use the + Add video button in the sidebar."
        />
      </div>
    </div>
  );
}
