import type { Meta, StoryObj } from '@storybook/nextjs';
import { PanelLeft, Search } from 'lucide-react';
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
          'The unified Add trigger. `sidebar` is a full-width row under the sidebar header, `icon` in the collapsed rail, and `hero` anchors the empty-state panels. All of them open the same auto-detecting Add dialog.',
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

export const Sidebar: Story = {
  args: { variant: 'sidebar' },
  render: (args) => (
    <div className="w-72">
      <AddButton {...args} />
    </div>
  ),
};

export const Icon: Story = { args: { variant: 'icon' } };

export const Hero: Story = { args: { variant: 'hero', label: 'Add a link' } };

function SidebarTop({ width, onClick }: { width: number; onClick: () => void }) {
  return (
    <div className="border-r border-border bg-sidebar pb-3" style={{ width }}>
      <div className="flex h-14 items-center border-b border-border px-3">
        <div className="@container flex min-w-0 flex-1 items-center justify-between gap-2 px-2">
          <span className="truncate text-base font-bold text-foreground">ReadTube</span>
          <div className="flex shrink-0 items-center gap-0.5">
            <span className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-muted-foreground">
              <Search className="h-4 w-4" />
              <kbd className="hidden rounded border border-border bg-muted px-1 py-0.5 font-sans text-[10px] font-medium leading-none @min-[12rem]:inline-block">
                ⌘K
              </kbd>
            </span>
            <span className="rounded p-1.5 text-muted-foreground">
              <PanelLeft className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
      <div className="px-3 pt-3">
        <AddButton variant="sidebar" onClick={onClick} />
      </div>
    </div>
  );
}

/** The top of the expanded sidebar as it renders in the app, at the
 *  default width and at the minimum resize width. */
export const InSidebar: Story = {
  render: (args) => (
    <div className="flex items-start gap-8">
      <SidebarTop width={288} onClick={args.onClick} />
      <SidebarTop width={200} onClick={args.onClick} />
    </div>
  ),
};
