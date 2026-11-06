import { FULL_WEBSITE_URL } from '@/constants';
import { serializeJsonLd } from '@/lib/seo/jsonLd';
import { ORGANIZATION_ID } from '@/lib/seo/organization';
import {
  type PublicContentMeta,
  type VideoJsonLdVideo,
  buildVideoJsonLd,
  pickContentDates,
  toIsoDuration,
  toPlainDescription,
} from '@/lib/seo/videoJsonLd';

describe('toPlainDescription', () => {
  it.each<{ desc: string; input: string | null | undefined; expected: string | null }>([
    { desc: 'plain text passes through', input: 'A short summary.', expected: 'A short summary.' },
    {
      desc: 'drops a frontmatter header',
      input: '---\nversion: v1\nhasLatex: false\n---\n\nA short summary.',
      expected: 'A short summary.',
    },
    {
      desc: 'strips emphasis, code, and link markup',
      input: 'Uses **bold**, *italic*, `code`, and [a link](https://example.com).',
      expected: 'Uses bold, italic, code, and a link.',
    },
    {
      desc: 'strips heading markers and collapses whitespace',
      input: '## Heading\n\nFirst line.\n  Second line.',
      expected: 'Heading First line. Second line.',
    },
    { desc: 'keeps a lone star', input: 'Compute 5 * 3.', expected: 'Compute 5 * 3.' },
    { desc: 'empty after stripping', input: '---\nversion: v1\n---\n', expected: null },
    { desc: 'null', input: null, expected: null },
    { desc: 'undefined', input: undefined, expected: null },
  ])('$desc', ({ input, expected }) => {
    expect(toPlainDescription(input)).toBe(expected);
  });
});

describe('toIsoDuration', () => {
  it.each<{ input: number | null | undefined; expected: string | null; desc: string }>([
    { input: 0, expected: 'PT0S', desc: 'zero seconds' },
    { input: 42, expected: 'PT42S', desc: 'seconds only' },
    { input: 60, expected: 'PT1M', desc: 'exact minute omits seconds' },
    { input: 754, expected: 'PT12M34S', desc: 'minutes and seconds' },
    { input: 3600, expected: 'PT1H', desc: 'exact hour omits minutes and seconds' },
    { input: 3603, expected: 'PT1H3S', desc: 'hour and seconds skip zero minutes' },
    { input: 3723, expected: 'PT1H2M3S', desc: 'hours, minutes, seconds' },
    { input: 12.7, expected: 'PT12S', desc: 'fractional seconds floored' },
    { input: null, expected: null, desc: 'null' },
    { input: undefined, expected: null, desc: 'undefined' },
    { input: -5, expected: null, desc: 'negative' },
    { input: Number.NaN, expected: null, desc: 'NaN' },
  ])('$desc', ({ input, expected }) => {
    expect(toIsoDuration(input)).toBe(expected);
  });
});

describe('pickContentDates', () => {
  const early = new Date('2026-01-01T00:00:00.000Z');
  const late = new Date('2026-02-01T00:00:00.000Z');

  it.each<{
    desc: string;
    input: (Date | null | undefined)[];
    expected: { datePublished: string | null; dateModified: string | null };
  }>([
    {
      desc: 'earliest is published, latest is modified',
      input: [late, early],
      expected: { datePublished: early.toISOString(), dateModified: late.toISOString() },
    },
    {
      desc: 'a single row is both published and modified',
      input: [early, null],
      expected: { datePublished: early.toISOString(), dateModified: early.toISOString() },
    },
    {
      desc: 'no rows gives no dates',
      input: [null, undefined],
      expected: { datePublished: null, dateModified: null },
    },
    {
      desc: 'invalid dates are ignored',
      input: [new Date('invalid'), late],
      expected: { datePublished: late.toISOString(), dateModified: late.toISOString() },
    },
  ])('$desc', ({ input, expected }) => {
    expect(pickContentDates(input)).toEqual(expected);
  });
});

describe('buildVideoJsonLd', () => {
  const pageUrl = `${FULL_WEBSITE_URL}/p/videos/VIDEO_ID`;
  const video: VideoJsonLdVideo = {
    title: 'Example video title',
    sourceId: 'VIDEO_ID',
    platform: 'YOUTUBE',
    publishedAt: '2025-12-01T00:00:00.000Z',
    durationSeconds: 754,
    thumbnailUrl: 'https://example.com/thumb.jpg',
    channelName: 'Example Channel',
    channelSourceId: 'CHANNEL_ID',
  };
  const content: PublicContentMeta = {
    datePublished: '2026-01-01T00:00:00.000Z',
    dateModified: '2026-02-01T00:00:00.000Z',
    language: 'en',
    description: 'A short summary.',
  };

  function nodeOf(graph: Record<string, unknown>[], type: string) {
    const node = graph.find((n) => n['@type'] === type);
    if (node == null) {
      throw new Error(`missing ${type} node`);
    }
    return node;
  }

  it('builds the Article, VideoObject, BreadcrumbList, and Organization nodes', () => {
    const { '@context': context, '@graph': graph } = buildVideoJsonLd({ pageUrl, video, content });
    expect(context).toBe('https://schema.org');
    expect(graph.map((n) => n['@type'])).toEqual([
      'Article',
      'VideoObject',
      'BreadcrumbList',
      'Organization',
    ]);

    expect(nodeOf(graph, 'Article')).toEqual({
      '@type': 'Article',
      '@id': `${pageUrl}#article`,
      headline: video.title,
      description: content.description,
      url: pageUrl,
      mainEntityOfPage: pageUrl,
      image: video.thumbnailUrl,
      inLanguage: 'en',
      datePublished: content.datePublished,
      dateModified: content.dateModified,
      author: { '@id': ORGANIZATION_ID },
      publisher: { '@id': ORGANIZATION_ID },
      isBasedOn: { '@id': `${pageUrl}#video` },
      about: { '@id': `${pageUrl}#video` },
    });

    const channel = {
      '@type': 'Organization',
      name: video.channelName,
      url: 'https://www.youtube.com/channel/CHANNEL_ID',
    };
    expect(nodeOf(graph, 'VideoObject')).toEqual({
      '@type': 'VideoObject',
      '@id': `${pageUrl}#video`,
      name: video.title,
      thumbnailUrl: video.thumbnailUrl,
      uploadDate: video.publishedAt,
      duration: 'PT12M34S',
      embedUrl: 'https://www.youtube.com/embed/VIDEO_ID',
      url: 'https://youtube.com/watch?v=VIDEO_ID',
      author: channel,
      creator: channel,
    });

    expect(nodeOf(graph, 'BreadcrumbList').itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'ReadTube', item: FULL_WEBSITE_URL },
      { '@type': 'ListItem', position: 2, name: video.channelName, item: channel.url },
      { '@type': 'ListItem', position: 3, name: video.title, item: pageUrl },
    ]);

    expect(nodeOf(graph, 'Organization')['@id']).toBe(ORGANIZATION_ID);
    expect(nodeOf(graph, 'Organization').sameAs).toEqual([
      'https://www.linkedin.com/company/readtube',
      'https://github.com/tuliren/readtube',
      'https://www.crunchbase.com/organization/readtube',
      'https://www.producthunt.com/products/readtube-2',
    ]);
  });

  it.each<{
    desc: string;
    video: VideoJsonLdVideo;
    content: PublicContentMeta | null;
    absentArticleKeys: string[];
    absentVideoKeys: string[];
  }>([
    {
      desc: 'no content meta drops dates, language, and description',
      video,
      content: null,
      absentArticleKeys: ['datePublished', 'dateModified', 'inLanguage', 'description'],
      absentVideoKeys: [],
    },
    {
      desc: 'missing video metadata drops upload date, duration, and thumbnail',
      video: { ...video, publishedAt: null, durationSeconds: null, thumbnailUrl: null },
      content,
      absentArticleKeys: ['image'],
      absentVideoKeys: ['uploadDate', 'duration', 'thumbnailUrl'],
    },
  ])('$desc', ({ video: v, content: c, absentArticleKeys, absentVideoKeys }) => {
    const { '@graph': graph } = buildVideoJsonLd({ pageUrl, video: v, content: c });
    const article = nodeOf(graph, 'Article');
    const videoObject = nodeOf(graph, 'VideoObject');
    for (const key of absentArticleKeys) {
      expect(article).not.toHaveProperty(key);
    }
    for (const key of absentVideoKeys) {
      expect(videoObject).not.toHaveProperty(key);
    }
  });

  it.each<{ platform: VideoJsonLdVideo['platform']; embedUrl: string; channelUrl: string }>([
    {
      platform: 'YOUTUBE',
      embedUrl: 'https://www.youtube.com/embed/VIDEO_ID',
      channelUrl: 'https://www.youtube.com/channel/CHANNEL_ID',
    },
    {
      platform: 'BILIBILI',
      embedUrl: 'https://player.bilibili.com/player.html?bvid=VIDEO_ID',
      channelUrl: 'https://space.bilibili.com/CHANNEL_ID',
    },
  ])('uses $platform embed and channel URLs', ({ platform, embedUrl, channelUrl }) => {
    const { '@graph': graph } = buildVideoJsonLd({
      pageUrl,
      video: { ...video, platform },
      content,
    });
    const videoObject = nodeOf(graph, 'VideoObject');
    expect(videoObject.embedUrl).toBe(embedUrl);
    expect(videoObject.author).toMatchObject({ url: channelUrl });
  });
});

describe('serializeJsonLd', () => {
  it.each<{ desc: string; input: unknown; expected: string }>([
    { desc: 'plain object', input: { a: 'b' }, expected: '{"a":"b"}' },
    {
      desc: 'escapes a closing script tag',
      input: { title: '</script><script>x</script>' },
      expected: '{"title":"\\u003c/script>\\u003cscript>x\\u003c/script>"}',
    },
  ])('$desc', ({ input, expected }) => {
    const out = serializeJsonLd(input);
    expect(out).toBe(expected);
    expect(JSON.parse(out)).toEqual(input);
  });
});
