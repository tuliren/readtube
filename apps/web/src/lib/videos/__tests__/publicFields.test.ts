import {
  UNKNOWN_CHANNEL_NAME,
  UNKNOWN_VIDEO_TITLE,
  YOUTUBE_GENERIC_DESCRIPTION,
} from '@/lib/platforms/youtube/constants';
import {
  publicChannelName,
  publicVideoDescription,
  publicVideoTitle,
} from '@/lib/videos/publicFields';

describe('publicVideoTitle', () => {
  it.each<{ desc: string; input: string | null; expected: string | null }>([
    { desc: 'a real title is trimmed', input: ' Example title ', expected: 'Example title' },
    { desc: 'a blank title', input: '  ', expected: null },
    { desc: 'null', input: null, expected: null },
    { desc: 'the placeholder title', input: UNKNOWN_VIDEO_TITLE, expected: null },
  ])('$desc', ({ input, expected }) => {
    expect(publicVideoTitle(input)).toBe(expected);
  });
});

describe('publicChannelName', () => {
  it.each<{
    desc: string;
    platform: 'YOUTUBE' | 'BILIBILI';
    input: string;
    expected: string | null;
  }>([
    {
      desc: 'a real name is trimmed',
      platform: 'YOUTUBE',
      input: ' Example ',
      expected: 'Example',
    },
    { desc: 'a blank name', platform: 'YOUTUBE', input: '', expected: null },
    {
      desc: 'the YouTube placeholder',
      platform: 'YOUTUBE',
      input: UNKNOWN_CHANNEL_NAME,
      expected: null,
    },
    { desc: 'the Bilibili placeholder', platform: 'BILIBILI', input: 'Unknown', expected: null },
    {
      desc: "another platform's placeholder is a real name",
      platform: 'BILIBILI',
      input: UNKNOWN_CHANNEL_NAME,
      expected: UNKNOWN_CHANNEL_NAME,
    },
  ])('$desc', ({ platform, input, expected }) => {
    expect(publicChannelName(platform, input)).toBe(expected);
  });
});

describe('publicVideoDescription', () => {
  it.each<{ desc: string; input: string | null; expected: string | null }>([
    { desc: 'collapses to one line', input: 'First.\n\nSecond.', expected: 'First. Second.' },
    { desc: 'a blank description', input: ' \n ', expected: null },
    { desc: 'null', input: null, expected: null },
    { desc: "YouTube's generic description", input: YOUTUBE_GENERIC_DESCRIPTION, expected: null },
  ])('$desc', ({ input, expected }) => {
    expect(publicVideoDescription(input)).toBe(expected);
  });
});
