import { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';

import ArticleMarkdown from '@/components/reader/ArticleMarkdown';

const meta = {
  title: 'Reader/ArticleMarkdown',
  component: ArticleMarkdown,
  tags: ['autodocs'],
  argTypes: {
    children: { control: 'text' },
    className: { control: 'text' },
    hasLatex: { control: 'boolean' },
    bulletsToParagraphs: { control: 'boolean' },
  },
} satisfies Meta<typeof ArticleMarkdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InlineMath: Story = {
  args: {
    hasLatex: true,
    children: "Einstein's famous relation $E = mc^2$ relates energy and mass.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Einstein's famous relation/)).toBeInTheDocument();
    await expect(canvasElement.querySelector('.katex')).not.toBeNull();
    await expect(canvasElement.querySelector('.katex-display')).toBeNull();
  },
};

export const DisplayMath: Story = {
  args: {
    hasLatex: true,
    children: 'Consider the integral:\n\n$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$\n\nUseful.',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.katex-display')).not.toBeNull();
  },
};

export const MixedProseAndMath: Story = {
  args: {
    hasLatex: true,
    children: [
      '## Theorem',
      '',
      'The inline form $a^2 + b^2 = c^2$ is Pythagoras.',
      '',
      '$$',
      'a^2 + b^2 = c^2',
      '$$',
    ].join('\n'),
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
    await expect(canvasElement.querySelector('.katex-display')).not.toBeNull();
  },
};

export const DollarSignsInProsePlain: Story = {
  args: {
    hasLatex: false,
    children: 'She raised **$2.2 million** and **$1.5 billion** across two rounds.',
  },
  play: async ({ canvasElement }) => {
    // hasLatex=false → single-$ math is disabled → dollar signs stay
    // literal and the bold structure survives intact.
    await expect(canvasElement.querySelector('.katex')).toBeNull();
    const strongs = canvasElement.querySelectorAll('strong');
    await expect(strongs.length).toBe(2);
    await expect(strongs[0]?.textContent).toBe('$2.2 million');
    await expect(strongs[1]?.textContent).toBe('$1.5 billion');
  },
};

export const DisplayMathEvenWithoutFlag: Story = {
  args: {
    hasLatex: false,
    children:
      'Plain prose with **$5** money and an explicit display block:\n\n$$\na^2 + b^2 = c^2\n$$',
  },
  play: async ({ canvasElement }) => {
    // hasLatex=false still renders $$…$$ because the delimiters are
    // unambiguous. Only single-$ is disabled.
    await expect(canvasElement.querySelector('.katex-display')).not.toBeNull();
    const strong = canvasElement.querySelector('strong');
    await expect(strong?.textContent).toBe('$5');
  },
};

export const ChineseEmphasis: Story = {
  args: {
    hasLatex: false,
    // Real-world Chinese summary text: `**` markers wedged between an
    // ideograph and full-width punctuation (`了**"…"**。`, `是**神经酰胺**，`).
    // CommonMark's flanking rules fail here and render the markers
    // literally while emphasizing the wrong span — remark-cjk-friendly
    // fixes it. See articleMarkdownPlugins.
    children:
      '在病因上，他区分了**“快性胰岛素抵抗”和“慢性胰岛素抵抗”**。' +
      '他强调关键不是甘油三酯，而是某些脂质，尤其是**神经酰胺**，会阻断胰岛素信号。',
  },
  play: async ({ canvasElement }) => {
    const strongs = canvasElement.querySelectorAll('strong');
    await expect(strongs.length).toBe(2);
    await expect(strongs[0]?.textContent).toBe('“快性胰岛素抵抗”和“慢性胰岛素抵抗”');
    await expect(strongs[1]?.textContent).toBe('神经酰胺');
    // No stray literal markers survived.
    await expect(canvasElement.textContent).not.toContain('**');
  },
};

export const ScriptInjectionStripped: Story = {
  args: {
    hasLatex: true,
    children: 'Safe math $x^2$ text <script>alert(1)</script> after.',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.katex')).not.toBeNull();
    await expect(canvasElement.querySelector('script')).toBeNull();
  },
};

export const AllBulletSummaryAsParagraphs: Story = {
  args: {
    hasLatex: false,
    bulletsToParagraphs: true,
    // Real failure mode from the full-summary prompt: the model wraps
    // every paragraph in a bullet despite the "never write the entire
    // summary as bullets" rule. With bulletsToParagraphs the markers
    // are dropped and each bullet renders as its own paragraph.
    children: [
      '- 这次访谈的核心，是诺兰解释《奥德赛》如何在极端条件下把"看起来不可能"的镜头拍出来：空中镜头依靠IMAX直升机云台。',
      '- 水下镜头则使用巨大的钢制防水壳，出水时沉重、入水后因浮力反而好操作，配合防水监视器完成取景。',
      '- 他还强调实拍优先于特效，**沉浸感**来自真实的物理环境。',
    ].join('\n'),
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('ul')).toBeNull();
    await expect(canvasElement.querySelector('li')).toBeNull();
    const paragraphs = canvasElement.querySelectorAll('p');
    await expect(paragraphs.length).toBe(3);
    await expect(paragraphs[0]?.textContent).toContain('这次访谈的核心');
    await expect(paragraphs[1]?.textContent).toContain('水下镜头');
    // Inline markdown inside the bullets still renders.
    await expect(canvasElement.querySelector('strong')?.textContent).toBe('沉浸感');
    // No stray bullet markers survive as text.
    await expect(canvasElement.textContent).not.toContain('- ');
  },
};

export const IntentionalListKeepsBullets: Story = {
  args: {
    hasLatex: false,
    bulletsToParagraphs: true,
    // A list preceded by prose is intentional (the prompt allows it
    // for list-of-N videos) — the flag must leave it untouched.
    children: [
      'The video ranks three camera rigs:',
      '',
      '- IMAX helicopter mount',
      '- Steel underwater housing',
      '- Handheld stabilizer',
    ].join('\n'),
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('ul')).not.toBeNull();
    await expect(canvasElement.querySelectorAll('li').length).toBe(3);
  },
};

export const ShortSummaryVariant: Story = {
  args: {
    hasLatex: true,
    children: 'A short summary in the muted variant with math: $f(x) = x + 1$.',
    className: 'text-gray-700',
  },
  play: async ({ canvasElement }) => {
    const article = canvasElement.querySelector('article');
    await expect(article?.className).toContain('text-gray-700');
    await expect(canvasElement.querySelector('.katex')).not.toBeNull();
  },
};
