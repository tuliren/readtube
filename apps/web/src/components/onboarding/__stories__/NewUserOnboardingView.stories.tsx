import type { Meta, StoryObj } from '@storybook/nextjs';
import { fn } from 'storybook/test';

import NewUserOnboardingView from '@/components/onboarding/NewUserOnboardingView';
import type { SuggestedChannel, SuggestedVideo } from '@/lib/onboarding/types';

/** Flat-color placeholder image, so the story needs no network. */
function swatch(hue: number, width: number, height: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="hsl(${hue},55%,60%)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

const CHANNEL_NAMES: [string, string | null][] = [
  ['Sample Science Lab', 'en'],
  ['Placeholder Finance Weekly', 'en'],
  ['Example History Hour', 'en'],
  ['Demo Design Notes', 'en'],
  ['Mock Tech Talks', 'en'],
  ['Fixture Fitness', 'en'],
  ['Stub Cooking Show', 'en'],
  ['Test Pattern Podcast', 'en'],
  ['Generic Math Club', 'en'],
  ['Dummy Startup Stories', 'en'],
  ['示例频道', 'zh'],
  ['サンプルチャンネル', 'ja'],
  ['Unlabeled Channel', null],
];

const channels: SuggestedChannel[] = CHANNEL_NAMES.map(([name, language], i) => ({
  id: `channel-${i}`,
  sourceId: `source-${i}`,
  platform: 'YOUTUBE',
  name,
  handle: null,
  logoUrl: i % 3 === 2 ? null : swatch(i * 37, 96, 96),
  followerCount: (i % 4) + 1,
  latestVideoAt: new Date(NOW - i * DAY_MS).toISOString(),
  recentVideoTitles: [`Latest upload from ${name}`, `An earlier upload from ${name}`],
  language,
}));

const videos: SuggestedVideo[] = Array.from({ length: 10 }, (_, i) => ({
  id: `video-${i}`,
  sourceId: `video-source-${i}`,
  platform: 'YOUTUBE',
  title:
    i === 1
      ? 'A deliberately long placeholder title that wraps onto a second line to check clamping'
      : `Placeholder video ${i + 1}`,
  thumbnailUrl: swatch(200 + i * 23, 480, 270),
  durationSeconds: 300 + i * 437,
  publishedAt: new Date(NOW - (i + 1) * 3 * 60 * 60 * 1000).toISOString(),
  channelName: channels[i % channels.length].name,
  channelLogoUrl: null,
  headline: i % 3 === 2 ? null : `A one-sentence summary headline for placeholder video ${i + 1}.`,
  language: i === 9 ? 'zh' : 'en',
}));

const meta = {
  title: 'Onboarding/New user page',
  component: NewUserOnboardingView,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Shown in place of the inbox until the user has added anything. Channels to follow on top, videos to read below, filtered to English by default; one button saves every pick. Pasting a supported link anywhere opens the Add dialog.',
      },
    },
  },
  args: {
    suggestions: { channels, videos },
    onAdd: fn(),
    onSubmit: fn(),
    submitting: false,
  },
  render: (args) => (
    <div className="flex h-screen bg-background">
      <NewUserOnboardingView {...args} />
    </div>
  ),
} satisfies Meta<typeof NewUserOnboardingView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Submitting: Story = { args: { submitting: true } };

/** No English content in the database: opens on "All languages". */
export const NoEnglish: Story = {
  args: {
    suggestions: {
      channels: channels.filter((c) => c.language !== 'en'),
      videos: videos.filter((v) => v.language !== 'en'),
    },
  },
};

export const ChannelsOnly: Story = {
  args: { suggestions: { channels, videos: [] } },
};
