import { Meta, StoryObj } from '@storybook/nextjs';

import Hero from '@/components/Hero';

const meta = {
  title: 'Web/Hero',
  component: Hero,
  tags: ['autodocs'],
} satisfies Meta<typeof Hero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
