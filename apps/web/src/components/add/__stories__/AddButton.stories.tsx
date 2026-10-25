import type { Meta, StoryObj } from '@storybook/nextjs';
import { fn } from 'storybook/test';

import AddButton from '@/components/add/AddButton';
import { TooltipProvider } from '@/components/ui/tooltip';

const meta = {
  title: 'Add/Add button',
  component: AddButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The unified Add trigger. `toolbar` sits in the sidebar header, `icon` in the collapsed rail, and `hero` anchors the empty-state panels. All of them open the same auto-detecting Add dialog.',
      },
    },
  },
  decorators: [
    (Story) => (
      <TooltipProvider delayDuration={0}>
        <Story />
      </TooltipProvider>
    ),
  ],
  args: { onClick: fn() },
} satisfies Meta<typeof AddButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Toolbar: Story = { args: { variant: 'toolbar' } };

export const Icon: Story = { args: { variant: 'icon' } };

export const Hero: Story = { args: { variant: 'hero', label: 'Add a link' } };

/** The expanded sidebar header as it renders in the app. */
export const InSidebarHeader: Story = {
  render: (args) => (
    <div className="flex h-14 w-72 items-center border-b border-r border-border bg-sidebar px-3">
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2">
        <span className="truncate text-base font-bold text-foreground">ReadTube</span>
        <AddButton {...args} variant="toolbar" />
      </div>
    </div>
  ),
};
