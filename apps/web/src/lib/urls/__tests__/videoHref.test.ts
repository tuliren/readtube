import { videoHref } from '@/lib/urls/videoHref';

describe('videoHref', () => {
  it('builds a /videos/:sourceId URL', () => {
    expect(videoHref({ sourceId: 'dQw4w9WgXcQ' })).toBe('/videos/dQw4w9WgXcQ');
  });

  it('percent-encodes special characters in the source id', () => {
    expect(videoHref({ sourceId: 'a b/c' })).toBe('/videos/a%20b%2Fc');
  });
});
