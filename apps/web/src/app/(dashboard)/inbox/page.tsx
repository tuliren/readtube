import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import VideoListView from '@/components/inbox/VideoListView';
import { parseInboxQuery } from '@/lib/inbox/filter';
import { loadInboxVideos, searchParamsToInboxQuery } from '@/lib/inbox/loadVideos';
import { resolveInboxView } from '@/lib/inbox/views';

interface Props {
  // Wide Next.js shape — we forward the whole bag through
  // searchParamsToInboxQuery / parseInboxQuery so SSR honors every
  // filter the client codec knows about (starred, saved, snoozed,
  // archived, unread, q, from, to, tagIds, sort, …).
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === 'string') {
      params.set(k, v);
    } else if (Array.isArray(v)) {
      for (const item of v) {
        params.append(k, item);
      }
    }
  }
  const view = resolveInboxView(parseInboxQuery(params));
  return { title: view?.label ?? 'Inbox' };
}

export default async function InboxPage({ searchParams }: Props) {
  const { userId } = await auth();
  // The (dashboard) layout already redirects unauthenticated users;
  // this guard narrows `userId` for the DB calls below.
  if (userId == null) {
    redirect('/');
  }

  const query = searchParamsToInboxQuery(await searchParams);

  // loadInboxVideos is the same helper /api/videos uses, so the SSR
  // payload is byte-for-byte identical to what SWR would have fetched
  // for this URL — the fallback is correct for any key a user can
  // land on directly (bookmark, shared link, sidebar nav). Returns
  // one page of videos plus the unpaginated total so the header can
  // render Page X of N controls.
  const initial = await loadInboxVideos(prisma, userId, query);

  return (
    <VideoListView
      initialVideos={initial.videos}
      initialTotal={initial.total}
      selectedChannelId={null}
      selectedVideoId={null}
    />
  );
}
