import type { Meta, StoryObj } from '@storybook/nextjs';
import { PanelLeft, Search } from 'lucide-react';
import { fn } from 'storybook/test';

import AddButton from '@/components/add/AddButton';

const meta = {
  title: 'Add/Add button',
  component: AddButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The unified Add trigger. `icon` sits in the sidebar header toolbar and at the top of the collapsed rail; `hero` anchors the empty-state panels. Both open the same auto-detecting Add dialog.',
      },
    },
  },
  args: { onClick: fn() },
} satisfies Meta<typeof AddButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Icon: Story = {};

export const Hero: Story = { args: { variant: 'hero', label: 'Add a link' } };

/** Mirrors the expanded sidebar header in DashboardShell. */
function SidebarHeader({ width, onClick }: { width: number; onClick: () => void }) {
  return (
    <div className="border-r border-border bg-sidebar" style={{ width }}>
      <div className="flex h-14 items-center border-b border-border px-3">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2">
          <span className="truncate text-base font-bold text-foreground">ReadTube</span>
          <div className="flex shrink-0 items-center gap-1">
            <AddButton onClick={onClick} />
            <span className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-muted-foreground">
              <Search className="h-4 w-4" />
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-sans text-[10px] font-medium leading-none">
                ⌘K
              </kbd>
            </span>
            <span className="rounded p-1.5 text-muted-foreground">
              <PanelLeft className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The sidebar header at its default width and at its minimum resize
 *  width (`MIN_WIDTH` in SidebarContext). The app name must not truncate
 *  at either. */
export const InSidebarHeader: Story = {
  render: (args) => (
    <div className="flex flex-col items-start gap-6">
      <SidebarHeader width={288} onClick={args.onClick} />
      <SidebarHeader width={260} onClick={args.onClick} />
    </div>
  ),
};
