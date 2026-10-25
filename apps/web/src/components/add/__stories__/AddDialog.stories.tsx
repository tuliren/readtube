import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import AddDialogView, { type AddDialogViewProps } from '@/components/add/AddDialogView';
import type { AddEntityResult } from '@/components/add/useAddEntity';
import { Button } from '@/components/ui/button';

// Placeholder links only; the dialog classifies by shape, not content.
const CHANNEL_LINK = 'youtube.com/@examplecreator';
const VIDEO_IN_PLAYLIST_LINK = 'https://www.youtube.com/watch?v=xxxxxxxxxxx&list=PLxxxxxxxxxxxx';

const succeed = async (): Promise<AddEntityResult> => {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return { ok: true };
};

/** Keeps the dialog's open state local so Cancel / submit close it
 *  and a button brings it back. */
function DialogHarness(props: AddDialogViewProps) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <AddDialogView {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}

const meta = {
  title: 'Add/Add dialog',
  component: AddDialogView,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The one dialog behind every add entry point. Without `kind` it detects channel, video, or playlist from the pasted link on each keystroke. With `kind` it is locked to that entity (a folder\'s "Add channel", a playlist\'s "Add video") and offers to switch when the link is something else. Type or paste in the input to try the detection.',
      },
    },
  },
  args: {
    open: true,
    onOpenChange: fn(),
    onSubmit: fn(succeed),
  },
  render: (args) => <DialogHarness {...args} />,
} satisfies Meta<typeof AddDialogView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unified: Story = {};

export const DetectsChannel: Story = {
  args: { initialUrl: CHANNEL_LINK },
  play: async ({ args }) => {
    const body = within(document.body);
    await waitFor(async () => expect(await body.findByText('YouTube channel')).toBeVisible());
    await userEvent.click(body.getByRole('button', { name: 'Add channel' }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith('channel', 'youtube.com/@examplecreator')
    );
  },
};

export const AmbiguousVideoInPlaylist: Story = {
  args: { initialUrl: VIDEO_IN_PLAYLIST_LINK },
  play: async () => {
    const body = within(document.body);
    const playlist = await body.findByRole('radio', { name: 'YouTube playlist' });
    await userEvent.click(playlist);
    await expect(playlist).toHaveAttribute('aria-checked', 'true');
    await expect(body.getByRole('button', { name: 'Add playlist' })).toBeEnabled();
  },
};

export const Unrecognized: Story = {
  args: { initialUrl: 'https://example.com/some/page' },
};

export const ServerError: Story = {
  args: {
    initialUrl: CHANNEL_LINK,
    onSubmit: fn(
      async (): Promise<AddEntityResult> => ({
        ok: false,
        error: 'You already follow this channel.',
      })
    ),
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(await body.findByRole('button', { name: 'Add channel' }));
    await waitFor(async () =>
      expect(await body.findByText('You already follow this channel.')).toBeVisible()
    );
  },
};

export const LockedChannel: Story = {
  args: { kind: 'channel' },
};

export const LockedVideoForPlaylist: Story = {
  args: { kind: 'video', title: 'Add video to playlist' },
};

export const LockedKindMismatch: Story = {
  args: { kind: 'video', title: 'Add standalone video', initialUrl: CHANNEL_LINK },
  play: async () => {
    const body = within(document.body);
    await waitFor(async () =>
      expect(await body.findByText(/looks like a YouTube channel link/)).toBeVisible()
    );
    await userEvent.click(body.getByRole('button', { name: 'Add it as a channel instead' }));
    await waitFor(async () =>
      expect(await body.findByRole('heading', { name: 'Add to ReadTube' })).toBeVisible()
    );
    await expect(body.getByRole('button', { name: 'Add channel' })).toBeEnabled();
  },
};
