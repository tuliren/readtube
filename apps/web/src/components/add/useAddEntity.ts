'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

import { useSidebarData } from '@/components/dashboard/SidebarDataContext';
import type { AddKind } from '@/lib/add/detectAddTarget';
import type { ChannelData } from '@/lib/types';
import { channelHref } from '@/lib/urls/channelHref';

export interface AddEntityOptions {
  /** Channel only: move the new subscription into this folder. */
  folderId?: string | null;
  /** Video only: also add the new video to this playlist. */
  playlistId?: string | null;
}

export type AddEntityResult = { ok: true } | { ok: false; error: string };

export type AddEntity = (
  kind: AddKind,
  url: string,
  options?: AddEntityOptions
) => Promise<AddEntityResult>;

const NETWORK_ERROR = 'Network error. Please check your connection and try again.';

const ENDPOINTS: Record<AddKind, string> = {
  channel: '/api/channels',
  video: '/api/videos',
  playlist: '/api/playlists',
};

const FALLBACK_ERRORS: Record<AddKind, string> = {
  channel: 'Something went wrong. Please try again.',
  video: 'Failed to add video.',
  playlist: 'Failed to add playlist.',
};

/**
 * One submit path for every "add" surface: the unified Add dialog and
 * the per-entity modals (Add channel / Add video / Add playlist).
 * POSTs the URL to the endpoint for `kind`, applies the follow-up
 * write the entry point asked for (folder move, playlist insert),
 * refreshes the sidebar caches, and navigates to the new entity.
 *
 * Resolves to `{ ok: false, error }` with the server's message on a
 * rejected add so the caller can keep its dialog open and show it.
 */
export function useAddEntity(): AddEntity {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { channels, mutateChannels } = useSidebarData();

  return useCallback<AddEntity>(
    async (kind, url, options = {}) => {
      let res: Response;
      try {
        res = await fetch(ENDPOINTS[kind], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
      } catch {
        return { ok: false, error: NETWORK_ERROR };
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: data.error ?? FALLBACK_ERRORS[kind] };
      }

      const revalidateLibrary = () =>
        void mutate(
          (key) =>
            typeof key === 'string' && (key.startsWith('/api/videos') || key === '/api/playlists')
        );

      if (kind === 'channel') {
        const channel = (await res.json()) as ChannelData;
        if (options.folderId != null) {
          await moveIntoFolder(channel, options.folderId);
        }
        void mutateChannels([...channels, channel].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success(`Following ${channel.name}`);
        router.push(channelHref(channel));
        return { ok: true };
      }

      if (kind === 'video') {
        const data = (await res.json()) as { sourceId: string; videoId: string };
        if (options.playlistId != null) {
          await addToPlaylist(data.videoId, options.playlistId);
        }
        toast.success('Video added');
        revalidateLibrary();
        router.push(`/videos/${encodeURIComponent(data.sourceId)}`);
        return { ok: true };
      }

      const data = (await res.json()) as {
        playlistId: string;
        playlistName: string;
        videosProcessed: number;
      };
      toast.success(`Added "${data.playlistName}" with ${data.videosProcessed} videos`);
      revalidateLibrary();
      router.push(`/videos/playlists/${data.playlistId}`);
      return { ok: true };
    },
    [router, mutate, channels, mutateChannels]
  );
}

/**
 * Best-effort folder assignment when the add was started from a
 * folder's "Add channel" entry. A failure is logged, not surfaced: the
 * channel is already subscribed and can still be dragged into the
 * folder. Only a 2xx mirrors the move into the optimistic payload, so
 * a 404 on a deleted folder leaves the channel at root in the sidebar.
 */
async function moveIntoFolder(channel: ChannelData, folderId: string): Promise<void> {
  try {
    const res = await fetch(`/api/subscriptions/${channel.id}/folder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
    if (res.ok) {
      channel.folderId = folderId;
    } else {
      console.error(
        `[useAddEntity] move into folder failed (${res.status})`,
        await res.text().catch(() => '')
      );
    }
  } catch (err) {
    console.error('[useAddEntity] move into folder failed', err);
  }
}

/**
 * Best-effort playlist insert when the add was started from a
 * playlist's "Add video" entry. fetch() resolves on 4xx/5xx, so a
 * non-2xx is logged explicitly rather than hidden behind the success
 * toast; the video is already in the library either way.
 */
async function addToPlaylist(videoId: string, playlistId: string): Promise<void> {
  try {
    const res = await fetch(`/api/playlists/${playlistId}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId }),
    });
    if (!res.ok) {
      console.error(
        `[useAddEntity] add to playlist failed (${res.status})`,
        await res.text().catch(() => '')
      );
    }
  } catch (err) {
    console.error('[useAddEntity] add to playlist failed', err);
  }
}
