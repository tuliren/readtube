import { Meta, StoryObj } from '@storybook/nextjs';

import Pricing from '@/components/Pricing';

const meta = {
  title: 'Web/Pricing',
  component: Pricing,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Pricing>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
