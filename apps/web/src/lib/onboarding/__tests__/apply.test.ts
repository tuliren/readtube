import { MAX_ONBOARDING_SELECTION, parseOnboardingSelection } from '@/lib/onboarding/apply';

// The real detector pulls in ESM-only franc, which ts-jest can't load.
jest.mock('@/lib/language/detect', () => ({ detectLanguage: jest.fn() }));

describe('parseOnboardingSelection', () => {
  it.each([
    {
      name: 'both lists',
      body: { channelIds: ['c1'], videoIds: ['v1', 'v2'] },
      expected: { channelIds: ['c1'], videoIds: ['v1', 'v2'] },
    },
    {
      name: 'channels only, with videos omitted',
      body: { channelIds: ['c1'] },
      expected: { channelIds: ['c1'], videoIds: [] },
    },
    {
      name: 'duplicates removed',
      body: { channelIds: ['c1', 'c1'], videoIds: ['v1', 'v1'] },
      expected: { channelIds: ['c1'], videoIds: ['v1'] },
    },
  ])('accepts $name', ({ body, expected }) => {
    expect(parseOnboardingSelection(body)).toEqual(expected);
  });

  it.each([
    { name: 'a null body', body: null },
    { name: 'a string body', body: 'c1' },
    { name: 'empty selections', body: { channelIds: [], videoIds: [] } },
    { name: 'a missing selection', body: {} },
    { name: 'a non-array list', body: { channelIds: 'c1' } },
    { name: 'a non-string id', body: { channelIds: [1] } },
    { name: 'a blank id', body: { videoIds: [' '] } },
    {
      name: 'too many ids',
      body: {
        channelIds: Array.from({ length: MAX_ONBOARDING_SELECTION + 1 }, (_, i) => `c${i}`),
      },
    },
  ])('rejects $name', ({ body }) => {
    expect(parseOnboardingSelection(body)).toBeNull();
  });
});
