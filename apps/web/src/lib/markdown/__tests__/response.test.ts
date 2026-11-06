import { markdownResponse } from '@/lib/markdown/response';

describe('markdownResponse', () => {
  it.each([
    [
      'with a canonical URL',
      { canonicalUrl: 'https://example.com/' },
      '<https://example.com/>; rel="canonical"',
    ],
    ['without a canonical URL', {}, null],
  ])('sets headers %s', (_case, options, link) => {
    const response = markdownResponse('# Hi\n', options);
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('Vary')).toBe('Accept');
    expect(response.headers.get('Link')).toBe(link);
  });

  it.each([[200], [404]])('passes status %i through', async (status) => {
    const response = markdownResponse('# Hi\n', { status });
    expect(response.status).toBe(status);
    expect(await response.text()).toBe('# Hi\n');
  });
});
