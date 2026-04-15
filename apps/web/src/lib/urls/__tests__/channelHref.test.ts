import { channelHref } from '@/lib/urls/channelHref';

describe('channelHref', () => {
  it.each([
    [{ handle: '@mkbhd', sourceId: 'UCBJycsmduvYEL83R_U4JriQ' }, '/channels/%40mkbhd'],
    [{ handle: 'mkbhd', sourceId: 'UCBJycsmduvYEL83R_U4JriQ' }, '/channels/%40mkbhd'],
    [{ handle: null, sourceId: 'UCBJycsmduvYEL83R_U4JriQ' }, '/channels/UCBJycsmduvYEL83R_U4JriQ'],
    [{ handle: '', sourceId: 'UCBJycsmduvYEL83R_U4JriQ' }, '/channels/UCBJycsmduvYEL83R_U4JriQ'],
  ])('builds canonical href for %j', (channel, expected) => {
    expect(channelHref(channel)).toBe(expected);
  });
});
