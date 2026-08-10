import { FULL_WEBSITE_URL } from '@/constants';
import {
  PUBLIC_VIDEO_SITEMAP_CAP,
  type SitemapVideoRow,
  buildVideoSitemapEntries,
} from '@/lib/sitemap/publicVideoSitemap';

function row(
  sourceId: string,
  latest?: { summaries?: Date[]; articles?: Date[] },
  older?: { summaries?: Date[]; articles?: Date[] }
): SitemapVideoRow {
  const toTranscript = (t: { summaries?: Date[]; articles?: Date[] }) => ({
    summaries: (t.summaries ?? []).map((generated_at) => ({ generated_at })),
    articles: (t.articles ?? []).map((generated_at) => ({ generated_at })),
  });
  const transcripts = [];
  if (latest != null) {
    transcripts.push(toTranscript(latest));
  }
  if (older != null) {
    transcripts.push(toTranscript(older));
  }
  return { source_id: sourceId, transcripts };
}

const T1 = new Date('2026-01-01T00:00:00Z');
const T2 = new Date('2026-02-01T00:00:00Z');
const T3 = new Date('2026-03-01T00:00:00Z');

describe('buildVideoSitemapEntries', () => {
  it('builds public page URLs in input order', () => {
    const entries = buildVideoSitemapEntries([
      row('vid_b', { summaries: [T1] }),
      row('vid_a', { articles: [T1] }),
    ]);
    expect(entries.map((e) => e.url)).toEqual([
      `${FULL_WEBSITE_URL}/p/videos/vid_b`,
      `${FULL_WEBSITE_URL}/p/videos/vid_a`,
    ]);
  });

  it.each([
    ['no transcripts', row('vid')],
    ['latest transcript has no READY content', row('vid', {})],
    [
      'only an older transcript has READY content',
      row('vid', {}, { summaries: [T1], articles: [T1] }),
    ],
  ])('excludes a video when %s', (_case, video) => {
    expect(buildVideoSitemapEntries([video])).toEqual([]);
  });

  it.each([
    ['newest summary', { summaries: [T1, T3], articles: [T2] }],
    ['newest article', { summaries: [T1], articles: [T2, T3] }],
    ['summary when there is no article', { summaries: [T3] }],
    ['article when there is no summary', { articles: [T3] }],
  ])('uses the %s generation time as lastModified', (_case, latest) => {
    const entries = buildVideoSitemapEntries([row('vid', latest)]);
    expect(entries).toHaveLength(1);
    expect(entries[0].lastModified).toEqual(T3);
  });

  it('caps entries at PUBLIC_VIDEO_SITEMAP_CAP, not counting excluded videos', () => {
    const videos: SitemapVideoRow[] = [row('ineligible')];
    for (let i = 0; i < PUBLIC_VIDEO_SITEMAP_CAP + 1; i++) {
      videos.push(row(`vid_${i}`, { summaries: [T1] }));
    }
    const entries = buildVideoSitemapEntries(videos);
    expect(entries).toHaveLength(PUBLIC_VIDEO_SITEMAP_CAP);
    expect(entries[0].url).toBe(`${FULL_WEBSITE_URL}/p/videos/vid_0`);
    expect(entries[entries.length - 1].url).toBe(
      `${FULL_WEBSITE_URL}/p/videos/vid_${PUBLIC_VIDEO_SITEMAP_CAP - 1}`
    );
  });
});
