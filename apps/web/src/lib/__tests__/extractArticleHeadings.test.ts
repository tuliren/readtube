import { extractArticleHeadings, headingDomId } from '@/lib/reader/extractArticleHeadings';

describe('extractArticleHeadings', () => {
  it.each([
    ['empty body', '', []],
    ['body with no headings', 'Just a paragraph\nanother line.', []],
    [
      'single h2',
      '## The only section\nSome body.',
      [{ id: headingDomId(2, 1), label: 'The only section', level: 2 }],
    ],
    [
      'mixed h2 and h3 preserves level and order',
      '## Intro\n\n### Details\n\n## Outro',
      [
        { id: headingDomId(2, 1), label: 'Intro', level: 2 },
        { id: headingDomId(3, 3), label: 'Details', level: 3 },
        { id: headingDomId(2, 5), label: 'Outro', level: 2 },
      ],
    ],
    [
      'ignores h1 and h4+',
      '# Title\n\n## Real section\n\n#### Ignored\n\n##### Also ignored',
      [{ id: headingDomId(2, 3), label: 'Real section', level: 2 }],
    ],
    [
      'strips trailing hashes from ATX closed headings',
      '## Section ##\n## Another ###',
      [
        { id: headingDomId(2, 1), label: 'Section', level: 2 },
        { id: headingDomId(2, 2), label: 'Another', level: 2 },
      ],
    ],
    [
      'ignores hash lines inside fenced code blocks',
      '## Real heading\n\n```\n## Not a heading\n```\n\n## After fence',
      [
        { id: headingDomId(2, 1), label: 'Real heading', level: 2 },
        { id: headingDomId(2, 7), label: 'After fence', level: 2 },
      ],
    ],
    [
      'keeps duplicate labels with distinct line-based ids',
      '## Same\n\n## Same',
      [
        { id: headingDomId(2, 1), label: 'Same', level: 2 },
        { id: headingDomId(2, 3), label: 'Same', level: 2 },
      ],
    ],
    [
      'skips empty heading text',
      '##    \n## Real',
      [{ id: headingDomId(2, 2), label: 'Real', level: 2 }],
    ],
  ])('%s', (_name, body, expected) => {
    expect(extractArticleHeadings(body)).toEqual(expected);
  });
});
