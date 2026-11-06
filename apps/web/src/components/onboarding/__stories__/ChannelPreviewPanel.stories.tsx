import type { Meta, StoryObj } from '@storybook/nextjs';
import { fn } from 'storybook/test';

import ChannelPreviewPanel from '@/components/onboarding/ChannelPreviewPanel';

import { sampleChannelPreview } from './previewFixtures';

const meta = {
  title: 'Onboarding/Channel preview',
  component: ChannelPreviewPanel,
  parameters: {
    docs: {
      description: {
        component:
          'The channel half of the onboarding preview. Readable videos open their own preview; the unreadable one is listed but dimmed.',
      },
    },
  },
  args: {
    channel: sampleChannelPreview('channel-0', 'Sample Science Lab'),
    onOpenVideo: fn(),
    now: Date.now(),
  },
} satisfies Meta<typeof ChannelPreviewPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoDescriptionOrVideos: Story = {
  args: {
    channel: {
      ...sampleChannelPreview('channel-1', 'Quiet Channel'),
      description: null,
      videos: [],
    },
  },
};
