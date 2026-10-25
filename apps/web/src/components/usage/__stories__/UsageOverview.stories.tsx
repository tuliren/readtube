import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';

import UsageOverview from '@/components/usage/UsageOverview';
import type { GenerationUsage } from '@/lib/usage/quota';

const periodStart = new Date(Date.UTC(2026, 5, 1));
const periodEnd = new Date(Date.UTC(2026, 6, 1));

const monthlyUsage = (captions: number, videos: number, minutes: number): GenerationUsage => ({
  captions: { used: captions, quota: 500 },
  generated: { videos, minutes, quotaMinutes: 5 * 60 },
  periodStart,
  periodEnd,
});

const meta = {
  title: 'Usage/Usage page',
  component: UsageOverview,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The /usage page body. YouTube caption fetches are metered by count; Gemini transcription is metered in video hours. Lifetime usage splits transcripts by the same two sources.',
      },
    },
  },
  args: {
    usage: monthlyUsage(38, 4, 85),
    lifetime: {
      transcript: { captions: 312, generated: 27 },
      summary: 145,
      article: 63,
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('progressbar', { name: 'Monthly YouTube transcripts used' })
    ).toHaveAttribute('aria-valuenow', String(args.usage.captions.used));
    await expect(
      canvas.getByRole('progressbar', { name: 'Monthly Gemini transcription minutes used' })
    ).toHaveAttribute('aria-valuenow', String(args.usage.generated.minutes));
  },
} satisfies Meta<typeof UsageOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async (context) => {
    await meta.play(context);
    const canvas = within(context.canvasElement);
    await expect(canvas.getByText('/ 5 hours')).toBeVisible();
    await expect(canvas.getByText('3.6 hours left')).toBeVisible();
    await expect(canvas.getByText(/4 videos this month/)).toBeVisible();
  },
};

export const NewUser: Story = {
  args: {
    usage: monthlyUsage(0, 0, 0),
    lifetime: {
      transcript: { captions: 0, generated: 0 },
      summary: 0,
      article: 0,
    },
  },
};

export const CaptionsOnly: Story = {
  args: {
    usage: monthlyUsage(120, 0, 0),
    lifetime: {
      transcript: { captions: 860, generated: 0 },
      summary: 410,
      article: 95,
    },
  },
};

export const OverQuota: Story = {
  args: {
    usage: monthlyUsage(612, 9, 7 * 60 + 20),
    lifetime: {
      transcript: { captions: 12480, generated: 1350 },
      summary: 6021,
      article: 2210,
    },
  },
};
