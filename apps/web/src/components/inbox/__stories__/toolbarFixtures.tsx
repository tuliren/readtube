import type { Decorator } from '@storybook/nextjs';
import { fn } from 'storybook/test';
import { SWRConfig } from 'swr';

import { SidebarDataProvider } from '@/components/dashboard/SidebarDataContext';
import { SidebarProvider } from '@/components/inbox/SidebarContext';
import type { VideoData } from '@/lib/types';

export const recentRefresh = () => new Date().toISOString();

export const unreadVideo: VideoData = {
  id: 'example-video',
  sourceId: 'example-source',
  platform: 'YOUTUBE',
  title: 'Example video',
  description: null,
  publishedAt: null,
  readAt: null,
  durationSeconds: null,
  thumbnailUrl: null,
  transcriptUnavailable: false,
  hasTranscript: false,
  hasSummary: false,
  hasArticle: false,
  channelId: 'example-channel',
  channelName: 'Example channel',
  channelSourceId: 'example-channel-source',
  channelHandle: null,
  isStarred: false,
  isSaved: false,
  isArchived: false,
  isStandalone: false,
  noteCount: 0,
};

export const withToolbarProviders: Decorator = (Story) => (
  <SWRConfig
    value={{
      provider: () => new Map(),
      revalidateOnMount: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      fallback: { '/api/playlists': [], '/api/videos/library-counts': { standaloneUnread: 0 } },
    }}
  >
    <SidebarDataProvider initialChannels={[]} initialFolders={[]}>
      <SidebarProvider>
        <Story />
      </SidebarProvider>
    </SidebarDataProvider>
  </SWRConfig>
);

/** Keep interactive refresh/read actions inside Storybook; never call a real API. */
export function mockToolbarRequests() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fn<typeof fetch>(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/refresh')) {
      return Response.json({ videosProcessed: 3 });
    }
    if (url === '/api/channels' || url === '/api/folders' || url === '/api/playlists') {
      return Response.json([]);
    }
    if (url === '/api/videos/library-counts') {
      return Response.json({ standaloneUnread: 0 });
    }
    if (url === '/api/videos/bulk' || url === '/api/videos/mark-all-read') {
      return Response.json({ affected: 1 });
    }
    throw new Error(`Unexpected Storybook request: ${url}`);
  });
  return () => {
    globalThis.fetch = originalFetch;
  };
}
