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
  },
} satisfies Meta<typeof ArticleMarkdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InlineMath: Story = {
  args: {
    children: "Einstein's famous relation $$E = mc^2$$ relates energy and mass.",
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
    children: 'Consider the integral:\n\n$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$\n\nUseful.',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.katex-display')).not.toBeNull();
  },
};

export const DollarSignsInProseStayLiteral: Story = {
  args: {
    children: 'She raised $2.2 million and then $1.5 billion. Single $ too.',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.katex')).toBeNull();
    await expect(canvasElement.textContent).toContain('$2.2 million');
    await expect(canvasElement.textContent).toContain('$1.5 billion');
  },
};

export const BoldAroundDollarAmounts: Story = {
  args: {
    children: 'She raised **$2.2 million** and **$1.5 billion** across two rounds.',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.katex')).toBeNull();
    const strongs = canvasElement.querySelectorAll('strong');
    await expect(strongs.length).toBe(2);
    await expect(strongs[0]?.textContent).toBe('$2.2 million');
    await expect(strongs[1]?.textContent).toBe('$1.5 billion');
  },
};

export const ScriptInjectionStripped: Story = {
  args: {
    children: 'Safe math $$x^2$$ text <script>alert(1)</script> after.',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.katex')).not.toBeNull();
    await expect(canvasElement.querySelector('script')).toBeNull();
  },
};

export const ShortSummaryVariant: Story = {
  args: {
    children: 'A short summary in the muted variant with math: $$f(x) = x + 1$$.',
    className: 'text-gray-700',
  },
  play: async ({ canvasElement }) => {
    const article = canvasElement.querySelector('article');
    await expect(article?.className).toContain('text-gray-700');
    await expect(canvasElement.querySelector('.katex')).not.toBeNull();
  },
};
