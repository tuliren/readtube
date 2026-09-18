import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, userEvent, within } from 'storybook/test';

import ExternalLinkActions from '@/components/ExternalLinkActions';
import InboxHeader from '@/components/inbox/InboxHeader';
import RefreshPlaylistButton from '@/components/inbox/RefreshPlaylistButton';

import {
  mockToolbarRequests,
  recentRefresh,
  unreadVideo,
  withToolbarProviders,
} from './toolbarFixtures';

const meta = {
  title: 'Inbox/Source toolbar',
  component: InboxHeader,
  tags: ['autodocs', 'source-toolbar'],
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
    docs: {
      description: {
        component:
          'Channel and playlist headers use the real shared toolbar. Storybook uses the staging environment so recent refreshes enforce the cooldown. Hover or focus the unread badge, the consumption ring, and the disabled refresh control to inspect their tooltips.',
      },
    },
  },
  decorators: [withToolbarProviders],
  beforeEach: mockToolbarRequests,
  args: {
    channelId: 'example-channel',
    channelSourceId: 'example-channel-source',
    channelPlatform: 'YOUTUBE',
    channelName: 'Example channel',
    channelLogoUrl: null,
    channelCheckedAt: null,
    consumption: { total: 20, consumed: 15 },
    unreadCount: 12,
    totalVideos: 72,
    videos: [unreadVideo],
  },
  play: async ({ canvasElement, args }) => {
    const badge = within(canvasElement).getByLabelText(`Unread video(s): ${args.unreadCount}`);
    await expect(badge).toBeVisible();
    await userEvent.hover(badge);
    await expect(await within(document.body).findByRole('tooltip')).toHaveTextContent(
      `Unread video(s): ${args.unreadCount}`
    );
    await userEvent.unhover(badge);
  },
} satisfies Meta<typeof InboxHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Channel: Story = {};

export const ChannelCooldown: Story = {
  render: (args) => <InboxHeader {...args} channelCheckedAt={recentRefresh()} />,
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Refresh channel' });
    await expect(button).toBeDisabled();
    await userEvent.hover(button.parentElement!);
    await expect(await within(document.body).findByRole('tooltip')).toHaveTextContent(
      'Refreshed recently'
    );
    await userEvent.unhover(button.parentElement!);
  },
};

export const ChannelUnrated: Story = {
  args: { consumption: { total: 1, consumed: 0 } },
  play: async ({ canvasElement }) => {
    const label = 'Not rated yet: this channel has only 1 video, and it takes 3 to rate one';
    const ring = within(canvasElement).getByLabelText(label);
    await expect(ring).toBeVisible();
    await userEvent.hover(ring);
    await expect(await within(document.body).findByRole('tooltip')).toHaveTextContent(label);
    await userEvent.unhover(ring);
  },
};

export const AllRead: Story = {
  args: { unreadCount: 0, videos: [{ ...unreadVideo, readAt: '2026-01-01T00:00:00Z' }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Unread video(s): 0')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Mark this page as read' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
  },
};

export const LongTitle: Story = {
  args: {
    channelName: 'An example channel with a very long name that needs to be truncated',
    unreadCount: 1234,
  },
};

export const Playlist: Story = {
  args: {
    channelId: null,
    channelSourceId: null,
    channelPlatform: null,
    channelName: 'Example playlist',
    consumption: null,
    unreadCount: 1,
    hideSearch: true,
    markAllReadBody: { playlistId: 'example-playlist' },
  },
  render: (args) => (
    <InboxHeader
      {...args}
      trailing={
        <>
          <ExternalLinkActions url="https://example.com/playlist" label="Open playlist" />
          <RefreshPlaylistButton playlistId="example-playlist" />
        </>
      }
    />
  ),
};

export const PlaylistCooldown: Story = {
  ...Playlist,
  render: (args) => (
    <InboxHeader
      {...args}
      trailing={
        <>
          <ExternalLinkActions url="https://example.com/playlist" label="Open playlist" />
          <RefreshPlaylistButton playlistId="example-playlist" checkedAt={recentRefresh()} />
        </>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Refresh playlist' })
    ).toBeDisabled();
  },
};

export const PlaylistAllRead: Story = {
  ...Playlist,
  args: { ...Playlist.args, ...AllRead.args },
  play: AllRead.play,
};
