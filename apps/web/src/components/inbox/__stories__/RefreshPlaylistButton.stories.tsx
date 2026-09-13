import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, userEvent, within } from 'storybook/test';

import RefreshPlaylistButton from '@/components/inbox/RefreshPlaylistButton';

import { mockToolbarRequests, recentRefresh, withToolbarProviders } from './toolbarFixtures';

const meta = {
  title: 'Inbox/Refresh playlist button',
  component: RefreshPlaylistButton,
  tags: ['autodocs', 'source-toolbar'],
  parameters: { nextjs: { appDirectory: true } },
  decorators: [withToolbarProviders],
  beforeEach: mockToolbarRequests,
  args: { playlistId: 'example-playlist', checkedAt: null },
} satisfies Meta<typeof RefreshPlaylistButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Available: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Refresh playlist' })
    ).toBeEnabled();
  },
};

export const Cooldown: Story = {
  render: (args) => <RefreshPlaylistButton {...args} checkedAt={recentRefresh()} />,
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Refresh playlist' });
    await expect(button).toBeDisabled();
    await userEvent.hover(button.parentElement!);
    await expect(await within(document.body).findByRole('tooltip')).toHaveTextContent(
      'Checked recently. Try again after 24 hours.'
    );
    await userEvent.unhover(button.parentElement!);
  },
};

export const CooldownExpired: Story = {
  args: { checkedAt: '2020-01-01T00:00:00Z' },
  play: Available.play,
};
