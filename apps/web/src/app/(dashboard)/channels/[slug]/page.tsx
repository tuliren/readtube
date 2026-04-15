import { auth } from '@clerk/nextjs/server';
import { prisma } from '@readtube/database';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import InboxListView from '@/components/inbox/InboxListView';
import { resolveChannelSlug } from '@/lib/channels/resolveChannelSlug';
import { loadInboxVideos, searchParamsToInboxQuery } from '@/lib/inbox/loadVideos';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const channel = await resolveChannelSlug(prisma, slug);
  if (channel == null) {
    return {};
  }
  return { title: channel.name };
}

export default async function ChannelPage({ params, searchParams }: Props) {
  const { userId } = await auth();
  if (userId == null) {
    redirect('/');
  }

  const { slug } = await params;
  const channel = await resolveChannelSlug(prisma, slug);
  if (channel == null) {
    notFound();
  }

  // IDOR: only show the channel if the user is subscribed to it.
  const subscribed = await prisma.userSubscription.findFirst({
    where: { user_id: userId, channel_id: channel.id },
    select: { id: true },
  });
  if (subscribed == null) {
    notFound();
  }

  // Scope the inbox loader to this channel. channelId is injected
  // server-side — it's not in the user-visible URL (the canonical
  // form is /channels/[slug]).
  const baseQuery = searchParamsToInboxQuery(await searchParams);
  const query = { ...baseQuery, channelId: channel.id };

  const initial = await loadInboxVideos(prisma, userId, query);

  return (
    <InboxListView
      initialVideos={initial.videos}
      initialTotal={initial.total}
      selectedChannelId={channel.id}
      selectedVideoId={null}
    />
  );
}
