import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, userEvent, within } from 'storybook/test';

import ExternalLinkActions from '@/components/ExternalLinkActions';

const meta = {
  title: 'Web/External link actions',
  component: ExternalLinkActions,
  tags: ['autodocs', 'source-toolbar'],
  args: { url: 'https://example.com/channel' },
} satisfies Meta<typeof ExternalLinkActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(document.body);
    const open = canvas.getByRole('link', { name: 'Open on YouTube' });
    await userEvent.hover(open);
    await expect(await page.findByRole('tooltip')).toHaveTextContent('Open on YouTube');
    await userEvent.unhover(open);
    const copy = canvas.getByRole('button', { name: 'Copy URL' });
    await userEvent.hover(copy);
    await expect(await page.findByRole('tooltip', { name: 'Copy URL' })).toHaveTextContent(
      'Copy URL'
    );
    await userEvent.unhover(copy);
  },
};

export const CustomLabel: Story = {
  args: { label: 'Open channel on Bilibili' },
  play: async ({ canvasElement }) => {
    const open = within(canvasElement).getByRole('link', { name: 'Open channel on Bilibili' });
    open.focus();
    await expect(await within(document.body).findByRole('tooltip')).toHaveTextContent(
      'Open channel on Bilibili'
    );
    open.blur();
  },
};
