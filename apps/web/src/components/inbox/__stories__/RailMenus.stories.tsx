import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import type { PlaylistRow } from '@/components/dashboard/SidebarDataContext';
import RailChannelsMenu from '@/components/inbox/RailChannelsMenu';
import RailPlaylistsMenu from '@/components/inbox/RailPlaylistsMenu';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ChannelData, FolderData } from '@/lib/types';

function channel(
  id: string,
  name: string,
  folderId: string | null,
  unreadCount: number
): ChannelData {
  return {
    id,
    sourceId: `source-${id}`,
    platform: 'YOUTUBE',
    name,
    handle: null,
    rssUrl: null,
    logoUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    checkedAt: null,
    unreadCount,
    folderId,
    priority: 0,
    muteUntil: null,
    consumption: { total: 0, consumed: 0 },
  };
}

const folders: FolderData[] = [
  { id: 'tech', name: 'Tech', sortOrder: 0 },
  { id: 'science', name: 'Science', sortOrder: 1 },
];

const channels: ChannelData[] = [
  channel('c1', 'Example tech channel', 'tech', 3),
  channel('c2', 'Another tech channel', 'tech', 0),
  channel('c3', 'Example science channel', 'science', 5),
  channel('c4', 'Root channel one', null, 2),
  channel('c5', 'Root channel two', null, 0),
];

const playlists: PlaylistRow[] = [
  {
    id: 'p1',
    name: 'Example course',
    customName: null,
    sortOrder: 0,
    checkedAt: null,
    videoCount: 12,
    unreadCount: 4,
    thumbnailUrl: null,
  },
  {
    id: 'p2',
    name: 'Watch later list',
    customName: null,
    sortOrder: 1,
    checkedAt: null,
    videoCount: 3,
    unreadCount: 0,
    thumbnailUrl: null,
  },
];

/** The library part of the collapsed 56px rail with both category menus. */
function Rail({ selectedChannelId = null }: { selectedChannelId?: string | null }) {
  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen w-14 flex-col gap-0.5 border-r border-border bg-sidebar px-1 pt-4">
        <RailPlaylistsMenu playlists={playlists} activePlaylistId={null} onAddPlaylist={fn()} />
        <RailChannelsMenu
          channels={channels}
          folders={folders}
          selectedChannelId={selectedChannelId}
          onAddChannel={fn()}
        />
      </div>
    </TooltipProvider>
  );
}

const meta = {
  title: 'Inbox/Collapsed rail menus',
  component: Rail,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'In the collapsed sidebar, Playlists and Channels are one icon each. Clicking opens a menu to the right: playlists are listed directly; channels show folders first, each a submenu of its channels, then the root-level channels.',
      },
    },
  },
} satisfies Meta<typeof Rail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const ChannelsOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Channels' }));
    const body = within(document.body);
    const root = await body.findByRole('menuitem', { name: /Root channel one/ });
    await waitFor(() => expect(root).toBeVisible());
    await userEvent.click(body.getByRole('menuitem', { name: /Tech/ }));
    await expect(
      await body.findByRole('menuitem', { name: /Example tech channel/ })
    ).toBeInTheDocument();
  },
};

export const PlaylistsOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Playlists' }));
    await expect(
      await within(document.body).findByRole('menuitem', { name: /Example course/ })
    ).toBeInTheDocument();
  },
};

export const ChannelSelected: Story = {
  args: { selectedChannelId: 'c3' },
};
