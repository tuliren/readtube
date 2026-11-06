import { onboardingSuccessMessage, selectionLabel } from '@/lib/onboarding/copy';

describe('selectionLabel', () => {
  it.each([
    { channels: 0, videos: 0, expected: 'Nothing selected yet' },
    { channels: 1, videos: 0, expected: '1 channel selected' },
    { channels: 0, videos: 3, expected: '3 videos selected' },
    { channels: 2, videos: 1, expected: '2 channels, 1 video selected' },
  ])('labels $channels channels and $videos videos', ({ channels, videos, expected }) => {
    expect(selectionLabel(channels, videos)).toBe(expected);
  });
});

describe('onboardingSuccessMessage', () => {
  it.each([
    { followedChannels: 2, addedVideos: 0, expected: 'Following 2 channels' },
    { followedChannels: 0, addedVideos: 1, expected: 'Added 1 video' },
    { followedChannels: 1, addedVideos: 2, expected: 'Following 1 channel, added 2 videos' },
    { followedChannels: 0, addedVideos: 0, expected: 'Already in your library' },
  ])(
    'describes $followedChannels channels and $addedVideos videos',
    ({ followedChannels, addedVideos, expected }) => {
      expect(onboardingSuccessMessage({ followedChannels, addedVideos })).toBe(expected);
    }
  );
});
