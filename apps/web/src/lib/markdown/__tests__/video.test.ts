import { type VideoMarkdownInput, buildVideoMarkdown, demoteHeadings } from '@/lib/markdown/video';

const BASE: VideoMarkdownInput = {
  title: 'Sample talk',
  channelName: 'Sample channel',
  channelUrl: 'https://example.com/channel',
  publishedAt: '2026-03-04T05:06:07.000Z',
  platformName: 'YouTube',
  watchUrl: 'https://example.com/watch',
  readerUrl: 'https://example.com/p/videos/sample',
  languageName: 'English',
  summary: { headline: 'One line', short: 'Short paragraph.', full: '- Point one\n- Point two' },
  article: '## Opening\n\nBody text.',
};

describe('demoteHeadings', () => {
  it.each([
    ['h1', '# Title', '## Title'],
    ['h2', '## Section', '### Section'],
    ['h5', '##### Deep', '###### Deep'],
    ['h6 stays at the deepest level', '###### Deepest', '###### Deepest'],
    ['a hash without a space', '#hashtag', '#hashtag'],
    ['plain text', 'Some text', 'Some text'],
  ])('handles %s', (_case, input, expected) => {
    expect(demoteHeadings(input)).toBe(expected);
  });

  it('leaves fenced code blocks alone', () => {
    const input = '# Title\n```\n# comment\n```\n## After';
    expect(demoteHeadings(input)).toBe('## Title\n```\n# comment\n```\n### After');
  });
});

describe('buildVideoMarkdown', () => {
  it('renders metadata, summary, then the article', () => {
    expect(buildVideoMarkdown(BASE)).toBe(
      [
        '# Sample talk',
        '',
        '- Channel: [Sample channel](https://example.com/channel)',
        '- Published: 2026-03-04',
        '- Source video: [Watch on YouTube](https://example.com/watch)',
        '- Read on ReadTube: https://example.com/p/videos/sample',
        '- Language: English',
        '',
        '## Summary',
        '',
        '**One line**',
        '',
        'Short paragraph.',
        '',
        '- Point one\n- Point two',
        '',
        '## Article',
        '',
        '### Opening\n\nBody text.',
        '',
      ].join('\n')
    );
  });

  it.each([
    ['no publish date', { publishedAt: null }, '- Published:'],
    ['no language', { languageName: null }, '- Language:'],
    ['no summary', { summary: null }, '## Summary'],
    ['no article', { article: null }, '## Article'],
  ])('omits the line or section with %s', (_case, override, absent) => {
    const markdown = buildVideoMarkdown({ ...BASE, ...override });
    expect(markdown).not.toContain(absent);
    expect(markdown.startsWith('# Sample talk\n')).toBe(true);
  });

  it('escapes markdown syntax in the title and channel name', () => {
    const markdown = buildVideoMarkdown({
      ...BASE,
      title: 'A [bracketed] *title*',
      channelName: 'Chan_nel',
    });
    expect(markdown).toContain('# A \\[bracketed\\] \\*title\\*');
    expect(markdown).toContain('[Chan\\_nel](https://example.com/channel)');
  });
});
