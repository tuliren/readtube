import { Meta, StoryObj } from '@storybook/nextjs';

import { Button } from '@/components/Button';

const meta = {
  title: 'Web/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'radio',
      options: ['solid', 'outline'],
    },
    color: {
      control: 'radio',
      options: ['slate', 'blue', 'white'],
    },
    className: {
      control: 'text',
    },
    children: {
      control: 'text',
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SolidSlate: Story = {
  args: {
    variant: 'solid',
    color: 'slate',
    children: 'Solid Slate Button',
  },
};

export const SolidBlue: Story = {
  args: {
    variant: 'solid',
    color: 'blue',
    children: 'Solid Blue Button',
  },
};

export const SolidWhite: Story = {
  args: {
    variant: 'solid',
    color: 'white',
    children: 'Solid White Button',
  },
  globals: {
    backgrounds: { value: 'dark' },
  },
};

export const OutlineSlate: Story = {
  args: {
    variant: 'outline',
    color: 'slate',
    children: 'Outline Slate Button',
  },
};

export const OutlineWhite: Story = {
  args: {
    variant: 'outline',
    color: 'white',
    children: 'Outline White Button',
  },
  globals: {
    backgrounds: { value: 'dark' },
  },
};

export const AsLink: Story = {
  args: {
    variant: 'solid',
    color: 'blue',
    href: '#',
    children: 'Button as Link',
  },
};
