import { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from '@storybook/test';

import ArticleMarkdown from '@/components/reader/ArticleMarkdown';

const meta = {
  title: 'Reader/ArticleMarkdown',
  component: ArticleMarkdown,
  tags: ['autodocs'],
  argTypes: {
    children: { control: 'text' },
    className: { control: 'text' },
    hasLatex: { control: 'boolean' },
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
    // hasLatex=false → remark-math is not loaded → dollar signs stay
    // literal and the bold structure survives intact.
    await expect(canvasElement.querySelector('.katex')).toBeNull();
    const strongs = canvasElement.querySelectorAll('strong');
    await expect(strongs.length).toBe(2);
    await expect(strongs[0]?.textContent).toBe('$2.2 million');
    await expect(strongs[1]?.textContent).toBe('$1.5 billion');
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
