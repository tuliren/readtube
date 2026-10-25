import type { Paragraph, PhrasingContent, Root, RootContent } from 'mdast';

import remarkPanguSpacing, { panguSpaceText } from '../remarkPanguSpacing';

// Hand-built mdast trees instead of a real remark parse: unified and
// remark-parse are ESM-only and Jest can't load them without extra
// transform config (see remarkBulletsToParagraphs.test.ts).

const text = (value: string): PhrasingContent => ({ type: 'text', value });
const strong = (...children: PhrasingContent[]): PhrasingContent => ({ type: 'strong', children });
const code = (value: string): PhrasingContent => ({ type: 'inlineCode', value });
const link = (...children: PhrasingContent[]): PhrasingContent => ({
  type: 'link',
  url: 'https://example.com',
  children,
});
const paragraph = (...children: PhrasingContent[]): Paragraph => ({ type: 'paragraph', children });
const root = (...children: RootContent[]): Root => ({ type: 'root', children });

function transform(tree: Root): Root {
  remarkPanguSpacing()(tree);
  return tree;
}

describe('remarkPanguSpacing', () => {
  it.each([
    ['Chinese', '使用OpenAI的GPT-6模型', '使用 OpenAI 的 GPT-6 模型'],
    ['Japanese', '日本語とEnglishの混在', '日本語と English の混在'],
    ['numbers', '版本v1.2发布于2026年', '版本 v1.2 发布于 2026 年'],
    ['already spaced text', '使用 OpenAI 的模型', '使用 OpenAI 的模型'],
    ['Korean', '한국어English텍스트', '한국어English텍스트'],
    ['English', 'Pure English text.', 'Pure English text.'],
  ])('spaces a text node with %s', (_, input, expected) => {
    expect(transform(root(paragraph(text(input))))).toEqual(root(paragraph(text(expected))));
  });

  it.each([
    [
      'CJK before bold Latin',
      paragraph(text('使用'), strong(text('OpenAI')), text('的模型')),
      paragraph(text('使用 '), strong(text('OpenAI')), text(' 的模型')),
    ],
    [
      'bold CJK before Latin',
      paragraph(strong(text('结论')), text('AI很重要')),
      paragraph(strong(text('结论')), text(' AI 很重要')),
    ],
    [
      'inline code between CJK',
      paragraph(text('用'), code('npm'), text('安装')),
      paragraph(text('用 '), code('npm'), text(' 安装')),
    ],
    [
      'a link next to CJK',
      paragraph(text('参见'), link(text('Docs')), text('页面')),
      paragraph(text('参见 '), link(text('Docs')), text(' 页面')),
    ],
    [
      'CJK punctuation at the boundary',
      paragraph(text('他说：'), strong(text('Yes')), text('。')),
      paragraph(text('他说：'), strong(text('Yes')), text('。')),
    ],
  ])('spaces across inline boundaries: %s', (_, input, expected) => {
    expect(transform(root(input))).toEqual(root(expected));
  });

  it('leaves code blocks untouched', () => {
    const block: RootContent = { type: 'code', lang: null, meta: null, value: '中文English' };
    expect(transform(root(block))).toEqual(root({ ...block }));
  });

  it('does not add space across separate paragraphs', () => {
    expect(transform(root(paragraph(text('中文')), paragraph(text('English'))))).toEqual(
      root(paragraph(text('中文')), paragraph(text('English')))
    );
  });
});

describe('panguSpaceText', () => {
  it.each([
    ['人工智能热潮中的OpenAI', '人工智能热潮中的 OpenAI'],
    ['Plain headline', 'Plain headline'],
  ])('spaces %s', (input, expected) => {
    expect(panguSpaceText(input)).toBe(expected);
  });
});
