import { FULL_WEBSITE_URL } from '@/constants';
import { buildLlmsFullTxt, buildLlmsTxt, selectRecentReads } from '@/lib/seo/llmsTxt';
import type { SitemapVideoRow } from '@/lib/sitemap/publicVideoSitemap';

const T1 = new Date('2026-01-01T00:00:00Z');

function row(sourceId: string, hasReadyContent: boolean): SitemapVideoRow {
  return {
    source_id: sourceId,
    title: `Title ${sourceId}`,
    channel: { name: `Channel ${sourceId}` },
    transcripts: [{ summaries: hasReadyContent ? [{ generated_at: T1 }] : [], articles: [] }],
  };
}

describe('buildLlmsTxt', () => {
  const videos = [
    { sourceId: 'vid_a', title: 'First [talk]', channelName: 'Chan A' },
    { sourceId: 'vid_b', title: 'Second talk', channelName: 'Chan B' },
  ];
  const txt = buildLlmsTxt(videos);

  it('follows the llms.txt layout: H1, then a blockquote summary', () => {
    const [h1, blank, summary] = txt.split('\n');
    expect(h1).toBe('# ReadTube');
    expect(blank).toBe('');
    expect(summary.startsWith('> ')).toBe(true);
  });

  it.each([['## Product'], ['## Legal'], ['## Recent reads']])('has a %s section', (heading) => {
    expect(txt.split('\n')).toContain(heading);
  });

  it.each([
    `${FULL_WEBSITE_URL}/index.md`,
    `${FULL_WEBSITE_URL}/#pricing`,
    `${FULL_WEBSITE_URL}/#faq`,
    `${FULL_WEBSITE_URL}/llms-full.txt`,
    `${FULL_WEBSITE_URL}/terms`,
    `${FULL_WEBSITE_URL}/privacy`,
  ])('links to %s', (url) => {
    expect(txt).toContain(`](${url})`);
  });

  it('lists videos in order as escaped titles linking to their markdown', () => {
    const first = txt.indexOf(`[First \\[talk\\]](${FULL_WEBSITE_URL}/p/videos/vid_a.md)`);
    const second = txt.indexOf(`[Second talk](${FULL_WEBSITE_URL}/p/videos/vid_b.md)`);
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(txt).toContain('by Chan A');
  });

  it('omits Recent reads when there are no videos', () => {
    expect(buildLlmsTxt([])).not.toContain('## Recent reads');
  });
});

describe('selectRecentReads', () => {
  it('keeps publicly readable rows in order and applies the limit', () => {
    const rows = [row('a', true), row('b', false), row('c', true), row('d', true)];
    expect(selectRecentReads(rows, 2)).toEqual([
      { sourceId: 'a', title: 'Title a', channelName: 'Channel a' },
      { sourceId: 'c', title: 'Title c', channelName: 'Channel c' },
    ]);
  });
});

describe('buildLlmsFullTxt', () => {
  it('joins the sections in order with separators', () => {
    expect(buildLlmsFullTxt({ home: '# Home\n', terms: '# Terms\n\n', privacy: '# Privacy' })).toBe(
      '# Home\n\n---\n\n# Terms\n\n---\n\n# Privacy\n'
    );
  });
});
