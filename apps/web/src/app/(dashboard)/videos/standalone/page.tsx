import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import VideoListView from '@/components/inbox/VideoListView';
import LibraryEmptyState from '@/components/library/LibraryVideoList';
import { loadInboxVideos, searchParamsToInboxQuery } from '@/lib/inbox/loadVideos';

export const metadata: Metadata = { title: 'Standalone videos' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * /videos/standalone — videos the user has added that aren't in any
 * playlist. Filtered view over StandaloneVideo rows, paginated + SWR-
 * enabled by the shared `VideoListView`. The library scope is injected
 * into the inbox query before `loadInboxVideos` / `/api/videos` see it.
 */
export default async function VideosStandalonePage({ searchParams }: Props) {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }

  const baseQuery = searchParamsToInboxQuery(await searchParams);
  const query = { ...baseQuery, library: 'standalone' as const };

  const initial = await loadInboxVideos(prisma, userId, query);

  if (initial.total === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <LibraryEmptyState emptyMessage="Add a YouTube video or playlist to get started." />
      </div>
    );
  }

  return (
    <VideoListView
      initialVideos={initial.videos}
      initialTotal={initial.total}
      selectedChannelId={null}
      selectedVideoId={null}
      library={{
        scope: { library: 'standalone' },
        title: 'Standalone',
        emptyMessage: 'No standalone videos on this page.',
        markAllReadBody: { standaloneOnly: true },
      }}
      showRemoveFromLibrary
    />
  );
}
