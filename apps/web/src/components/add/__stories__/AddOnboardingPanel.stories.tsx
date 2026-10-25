import type { Meta, StoryObj } from '@storybook/nextjs';
import { fn } from 'storybook/test';

import AddDemo from '@/components/add/AddDemo';
import AddOnboardingPanel from '@/components/add/AddOnboardingPanel';

const meta = {
  title: 'Add/Onboarding panel',
  component: AddOnboardingPanel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Centered empty-state panel built around the unified Add button. `welcome` is the first-run inbox: an animated demo of link detection, the Add button, and one card per kind. Pasting a supported link anywhere on the page opens the dialog prefilled. `compact` is for an empty page that is not the first stop, such as the standalone video library.',
      },
    },
  },
  args: { onAdd: fn() },
  render: (args) => (
    <div className="flex h-screen bg-background">
      <AddOnboardingPanel {...args} />
    </div>
  ),
} satisfies Meta<typeof AddOnboardingPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Welcome: Story = {};

export const Compact: Story = {
  args: {
    variant: 'compact',
    title: 'No videos yet',
    description:
      'Paste a video or playlist link to start reading. Standalone videos and playlists you add show up here.',
  },
};

/** The demo on its own, looping through each link shape. */
export const DemoAnimated: Story = {
  render: () => (
    <div className="mx-auto max-w-md p-8">
      <AddDemo animate />
    </div>
  ),
};

/** What users with `prefers-reduced-motion` see instead of the loop. */
export const DemoReducedMotion: Story = {
  render: () => (
    <div className="mx-auto max-w-md p-8">
      <AddDemo animate={false} />
    </div>
  ),
};
