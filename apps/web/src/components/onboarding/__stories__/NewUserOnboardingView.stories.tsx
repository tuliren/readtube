import type { Meta, StoryObj } from '@storybook/nextjs';
import { fn } from 'storybook/test';
import { SWRConfig } from 'swr';

import NewUserOnboardingView from '@/components/onboarding/NewUserOnboardingView';
import type { SuggestedChannel, SuggestedVideo } from '@/lib/onboarding/types';

import { mockPreviewRequests, swatch } from './previewFixtures';

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

/** What the server resolves for the fixture languages. */
const LANGUAGE_NAMES = { en: 'English', ja: '日本語', zh: '中文' };

const meta = {
  title: 'Onboarding/New user page',
  component: NewUserOnboardingView,
  parameters: {
    layout: 'fullscreen',
    // The video preview renders VideoReader, which reads search params.
    nextjs: { appDirectory: true },
    docs: {
      description: {
        component:
          'Shown in place of the inbox until the user has added anything. Channels to follow on top, videos to read below, filtered to English by default; one button saves every pick. Each card has a Preview button; preview requests are answered with fixtures here. Pasting a supported link anywhere opens the Add dialog.',
      },
    },
  },
  args: {
    suggestions: { channels, videos, languageNames: LANGUAGE_NAMES },
    onAdd: fn(),
    onSubmit: fn(),
    submitting: false,
  },
  beforeEach: mockPreviewRequests,
  render: (args) => (
    <SWRConfig value={{ provider: () => new Map() }}>
      <div className="flex h-screen bg-background">
        <NewUserOnboardingView {...args} />
      </div>
    </SWRConfig>
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
      languageNames: LANGUAGE_NAMES,
    },
  },
};

export const ChannelsOnly: Story = {
  args: { suggestions: { channels, videos: [], languageNames: LANGUAGE_NAMES } },
};
