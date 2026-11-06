import type { VideoPlatform } from '@/lib/types';

/** A channel offered on the new-user onboarding page. */
export interface SuggestedChannel {
  id: string;
  sourceId: string;
  platform: VideoPlatform;
  name: string;
  handle: string | null;
  logoUrl: string | null;
  /** How many ReadTube users follow it. */
  followerCount: number;
  /** ISO timestamp of the channel's newest video. */
  latestVideoAt: string;
  /** Newest video titles, newest first, for a peek at what it posts. */
  recentVideoTitles: string[];
  /** Primary language subtag (`en`, `zh`, …), or null when unknown. */
  language: string | null;
}

/** A video offered on the new-user onboarding page. */
export interface SuggestedVideo {
  id: string;
  sourceId: string;
  platform: VideoPlatform;
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  /** ISO timestamp, or null when the platform didn't give one. */
  publishedAt: string | null;
  channelName: string;
  channelLogoUrl: string | null;
  /** One-line summary headline, when one has been generated. */
  headline: string | null;
  /** Primary language subtag (`en`, `zh`, …), or null when unknown. */
  language: string | null;
}

export interface OnboardingSuggestions {
  channels: SuggestedChannel[];
  videos: SuggestedVideo[];
  /**
   * Chip label per language code present above, named in that language
   * (`zh` → "中文"). Resolved on the server so the server and browser
   * render the same text; a code with no name is left out.
   */
  languageNames: Record<string, string>;
}

/** Body of `POST /api/onboarding`. */
export interface OnboardingSelection {
  channelIds: string[];
  videoIds: string[];
}

/** Response of `POST /api/onboarding`. */
export interface OnboardingResult {
  followedChannels: number;
  addedVideos: number;
}

/** A recent video listed in a channel preview. */
export interface ChannelPreviewVideo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  /** ISO timestamp, or null when the platform didn't give one. */
  publishedAt: string | null;
  headline: string | null;
  /** True when it has a READY summary or article, so it can be previewed. */
  readable: boolean;
}

/** Response of `GET /api/onboarding/preview/channels/[id]`. */
export interface ChannelPreview {
  id: string;
  sourceId: string;
  platform: VideoPlatform;
  name: string;
  handle: string | null;
  logoUrl: string | null;
  description: string | null;
  followerCount: number;
  /** Newest videos, newest first. */
  videos: ChannelPreviewVideo[];
}
