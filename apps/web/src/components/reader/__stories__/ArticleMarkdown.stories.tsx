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

export const InlineMathSingleDollar: Story = {
  args: {
    children: "Einstein's famous relation $E = mc^2$ relates energy and mass.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Einstein's famous relation/)).toBeInTheDocument();
    const katex = canvasElement.querySelector('.katex');
    await expect(katex).not.toBeNull();
    await expect(canvasElement.querySelector('.katex-display')).toBeNull();
  },
};

export const InlineMathDoubleDollar: Story = {
  args: {
    children: 'Double-dollar form also works inline: $$a + b$$ right here.',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.katex')).not.toBeNull();
    await expect(canvasElement.querySelector('.katex-display')).toBeNull();
  },
};

export const LooseInlineMathStaysLiteral: Story = {
  args: {
    children: 'Leading space: $ x = 1$. Trailing space: $x = 1 $. Both: $ x = 1 $.',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.katex')).toBeNull();
    await expect(canvasElement.textContent).toContain('$ x = 1$');
    await expect(canvasElement.textContent).toContain('$x = 1 $');
  },
};

export const DisplayMath: Story = {
  args: {
    children: 'Consider the integral:\n\n$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$\n\nUseful.',
  },
  play: async ({ canvasElement }) => {
    const display = canvasElement.querySelector('.katex-display');
    await expect(display).not.toBeNull();
  },
};

export const MixedProseAndMath: Story = {
  args: {
    children: [
      '## Theorem',
      '',
      'The inline form $a^2 + b^2 = c^2$ is Pythagoras.',
      '',
      'Here is the display form:',
      '',
      '$$',
      'a^2 + b^2 = c^2',
      '$$',
      '',
      'Key points:',
      '',
      '- Right triangles only',
      '- Holds in Euclidean geometry',
    ].join('\n'),
  },
  play: async ({ canvasElement }) => {
    const katexNodes = canvasElement.querySelectorAll('.katex');
    await expect(katexNodes.length).toBeGreaterThanOrEqual(2);
    await expect(canvasElement.querySelector('.katex-display')).not.toBeNull();
    const listItems = canvasElement.querySelectorAll('li');
    await expect(listItems.length).toBe(2);
  },
};

export const BoldAroundDollarAmount: Story = {
  args: {
    children: 'The total raised was **$2.2 million** in seed funding.',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.katex')).toBeNull();
    const strong = canvasElement.querySelector('strong');
    await expect(strong).not.toBeNull();
    await expect(strong?.textContent).toBe('$2.2 million');
  },
};

export const BoldAroundTwoDollarAmounts: Story = {
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

export const LoneDollarSign: Story = {
  args: {
    children: 'The price is $5.',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.katex')).toBeNull();
    await expect(canvasElement.textContent).toContain('$5');
  },
};

export const MultipleUnmatchedDollars: Story = {
  args: {
    children: 'I paid $5 for $10 worth of stock.',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.katex')).toBeNull();
    await expect(canvasElement.textContent).toContain('$5');
    await expect(canvasElement.textContent).toContain('$10');
  },
};

export const DollarAmountWithDecimal: Story = {
  args: {
    children: '$5.00 off today only.',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.katex')).toBeNull();
    await expect(canvasElement.textContent).toContain('$5.00');
  },
};

export const TrailingDollar: Story = {
  args: {
    children: 'Total cost: $',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.katex')).toBeNull();
    await expect(canvasElement.textContent).toContain('$');
  },
};

export const ScriptInjectionStripped: Story = {
  args: {
    children: 'Safe math $x^2$ text <script>alert(1)</script> after.',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.katex')).not.toBeNull();
    // Markdown does not execute raw HTML by default, and sanitize
    // additionally forbids <script>. What matters is that there's no
    // live script element in the DOM.
    await expect(canvasElement.querySelector('script')).toBeNull();
  },
};

export const ShortSummaryVariant: Story = {
  args: {
    children: 'A short summary using the muted color variant: $f(x) = x + 1$.',
    className: 'text-gray-700',
  },
  play: async ({ canvasElement }) => {
    const article = canvasElement.querySelector('article');
    await expect(article).not.toBeNull();
    await expect(article?.className).toContain('text-gray-700');
    await expect(canvasElement.querySelector('.katex')).not.toBeNull();
  },
};
