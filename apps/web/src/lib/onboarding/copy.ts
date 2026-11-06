import type { OnboardingResult } from './types';

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Footer label for the current picks, e.g. "2 channels, 1 video selected". */
export function selectionLabel(channelCount: number, videoCount: number): string {
  const parts: string[] = [];
  if (channelCount > 0) {
    parts.push(pluralize(channelCount, 'channel'));
  }
  if (videoCount > 0) {
    parts.push(pluralize(videoCount, 'video'));
  }
  return parts.length === 0 ? 'Nothing selected yet' : `${parts.join(', ')} selected`;
}

/** Toast shown once the picks are saved, e.g. "Following 2 channels, added 1 video". */
export function onboardingSuccessMessage({
  followedChannels,
  addedVideos,
}: OnboardingResult): string {
  const parts: string[] = [];
  if (followedChannels > 0) {
    parts.push(`Following ${pluralize(followedChannels, 'channel')}`);
  }
  if (addedVideos > 0) {
    parts.push(`${parts.length > 0 ? 'added' : 'Added'} ${pluralize(addedVideos, 'video')}`);
  }
  return parts.length === 0 ? 'Already in your library' : parts.join(', ');
}

/**
 * Where to send the user once their picks are saved: the inbox when
 * they followed a channel, the Standalone videos library when they only
 * added videos, or null to stay put when nothing new was added.
 */
export function onboardingDestination({
  followedChannels,
  addedVideos,
}: OnboardingResult): string | null {
  if (followedChannels > 0) {
    return '/inbox';
  }
  if (addedVideos > 0) {
    return '/videos/standalone';
  }
  return null;
}
