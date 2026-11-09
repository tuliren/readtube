import { FULL_WEBSITE_URL } from '@/constants';
import {
  UNKNOWN_CHANNEL_NAME,
  UNKNOWN_VIDEO_TITLE,
  YOUTUBE_GENERIC_DESCRIPTION,
} from '@/lib/platforms/youtube/constants';
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
    description: "The video's own\n\ndescription.",
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
      description: content.description,
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
      desc: 'missing optional video metadata drops duration and description',
      video: { ...video, durationSeconds: null, description: '  ' },
      content: null,
      absentArticleKeys: [],
      absentVideoKeys: ['duration', 'description'],
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

  it('falls back to the video description, on one line, without a summary', () => {
    const { '@graph': graph } = buildVideoJsonLd({ pageUrl, video, content: null });
    expect(nodeOf(graph, 'VideoObject').description).toBe("The video's own description.");
  });

  it.each<{ desc: string; video: VideoJsonLdVideo }>([
    { desc: 'a blank title', video: { ...video, title: '  ' } },
    { desc: 'no upload date', video: { ...video, publishedAt: null } },
    { desc: 'no thumbnail', video: { ...video, thumbnailUrl: null } },
    { desc: 'the placeholder title', video: { ...video, title: UNKNOWN_VIDEO_TITLE } },
  ])('omits the VideoObject for $desc and bases the Article on the watch URL', ({ video: v }) => {
    const { '@graph': graph } = buildVideoJsonLd({ pageUrl, video: v, content });
    expect(graph.map((n) => n['@type'])).not.toContain('VideoObject');
    const article = nodeOf(graph, 'Article');
    expect(article.isBasedOn).toBe('https://youtube.com/watch?v=VIDEO_ID');
    expect(article).not.toHaveProperty('about');
  });

  it.each<{ desc: string; video: VideoJsonLdVideo; expected: { name: string; item: string }[] }>([
    {
      desc: 'a blank channel name drops the channel crumb',
      video: { ...video, channelName: '' },
      expected: [
        { name: 'ReadTube', item: FULL_WEBSITE_URL },
        { name: video.title, item: pageUrl },
      ],
    },
    {
      desc: 'the placeholder channel name drops the channel crumb',
      video: { ...video, channelName: UNKNOWN_CHANNEL_NAME },
      expected: [
        { name: 'ReadTube', item: FULL_WEBSITE_URL },
        { name: video.title, item: pageUrl },
      ],
    },
    {
      desc: 'names are trimmed',
      video: { ...video, title: ' Example video title ', channelName: ' Example Channel ' },
      expected: [
        { name: 'ReadTube', item: FULL_WEBSITE_URL },
        { name: video.channelName, item: 'https://www.youtube.com/channel/CHANNEL_ID' },
        { name: video.title, item: pageUrl },
      ],
    },
  ])('$desc', ({ video: v, expected }) => {
    const { '@graph': graph } = buildVideoJsonLd({ pageUrl, video: v, content });
    expect(nodeOf(graph, 'BreadcrumbList').itemListElement).toEqual(
      expected.map((c, i) => ({ '@type': 'ListItem', position: i + 1, ...c }))
    );
  });

  it('omits the BreadcrumbList without a title, since the trail must end at the page', () => {
    const { '@graph': graph } = buildVideoJsonLd({
      pageUrl,
      video: { ...video, title: '' },
      content,
    });
    expect(graph.map((n) => n['@type'])).toEqual(['Article', 'Organization']);
  });

  it("skips YouTube's generic description in the fallback", () => {
    const { '@graph': graph } = buildVideoJsonLd({
      pageUrl,
      video: { ...video, description: YOUTUBE_GENERIC_DESCRIPTION },
      content: null,
    });
    expect(nodeOf(graph, 'VideoObject')).not.toHaveProperty('description');
  });

  it('drops the channel credit from the VideoObject when the channel name is blank', () => {
    const { '@graph': graph } = buildVideoJsonLd({
      pageUrl,
      video: { ...video, channelName: '' },
      content,
    });
    const videoObject = nodeOf(graph, 'VideoObject');
    expect(videoObject).not.toHaveProperty('author');
    expect(videoObject).not.toHaveProperty('creator');
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
