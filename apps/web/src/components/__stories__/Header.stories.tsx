import { Meta, StoryObj } from '@storybook/nextjs';

import Header from '@/components/Header';

const meta = {
  title: 'Web/Header',
  component: Header,
  tags: ['autodocs'],
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
