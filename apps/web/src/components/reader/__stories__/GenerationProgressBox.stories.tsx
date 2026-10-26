import { Meta, StoryObj } from '@storybook/nextjs';
import { useEffect, useState } from 'react';
import { expect, within } from 'storybook/test';

import GenerationProgressBox from '@/components/reader/GenerationProgressBox';
import TranscriptFallbackStep from '@/components/reader/TranscriptFallbackStep';
import type { GenerationStage } from '@/lib/reader/generationProgress';

const meta = {
  title: 'Reader/GenerationProgressBox',
  component: GenerationProgressBox,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 720 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GenerationProgressBox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FetchingTranscript: Story = {
  args: { stage: { kind: 'transcript' }, subject: 'summary' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Fetching the transcript')).toBeInTheDocument();
    await expect(canvas.getByRole('progressbar')).toBeInTheDocument();
  },
};

export const Drafting: Story = {
  args: { stage: { kind: 'drafting' }, subject: 'article' },
};

export const Transcribing: Story = {
  args: { stage: { kind: 'transcribing' }, subject: 'summary' },
};

export const WritingSections: Story = {
  args: { stage: { kind: 'writing', sectionsReady: 4, sectionsTotal: 9 }, subject: 'article' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Writing 9 sections')).toBeInTheDocument();
    await expect(canvas.getByText('4 of 9 ready')).toBeInTheDocument();
  },
};

const SEQUENCE: GenerationStage[] = [
  { kind: 'transcript' },
  { kind: 'starting' },
  { kind: 'queued' },
  { kind: 'embedding' },
  { kind: 'writing', sectionsReady: 0, sectionsTotal: 4 },
  { kind: 'writing', sectionsReady: 1, sectionsTotal: 4 },
  { kind: 'writing', sectionsReady: 2, sectionsTotal: 4 },
  { kind: 'writing', sectionsReady: 3, sectionsTotal: 4 },
  { kind: 'writing', sectionsReady: 4, sectionsTotal: 4 },
  { kind: 'reducing' },
];

function SequenceDemo() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const interval = setInterval(
      () => setIndex((i) => Math.min(i + 1, SEQUENCE.length - 1)),
      1_500
    );
    return () => clearInterval(interval);
  }, []);
  return <GenerationProgressBox stage={SEQUENCE[index]} subject="article" />;
}

/** Walks through a long-article generation, one stage every 1.5s. */
export const LongArticleSequence: Story = {
  args: { stage: SEQUENCE[0], subject: 'article' },
  render: () => <SequenceDemo />,
};

/** The no-captions choice shown in place of the box. Outside the app
 *  the status fetch fails, so it lands on the idle choice. */
export const NoCaptionsChoice: Story = {
  args: { stage: { kind: 'transcript' }, subject: 'summary' },
  render: () => (
    <TranscriptFallbackStep
      videoDbId="placeholder-video"
      subject="summary"
      onReady={() => {}}
      onCancel={() => {}}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('This video has no captions')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Transcribe with AI' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  },
};
