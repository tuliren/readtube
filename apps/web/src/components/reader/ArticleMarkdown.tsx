'use client';

import ReactMarkdown from 'react-markdown';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

interface Props {
  children: string;
  /** Extra classes appended to the default article styling. Used for
   *  per-caller tweaks like the muted color on short summaries. */
  className?: string;
}

const BASE_CLASS = 'prose prose-gray max-w-none font-sans text-[17px] leading-[1.8]';

/**
 * Shared Markdown renderer for AI-generated reader content (summaries,
 * articles). Single source of truth for the remark/rehype plugin set.
 *
 * LaTeX support: only `$$…$$` is treated as math (inline when embedded
 * in prose, display when on its own paragraph). Single-`$` math is
 * disabled because remark-math's tokenizer is too permissive with
 * prose dollar signs and would break "$5 for $10" or bold around
 * "**$2.2 million**". The generation prompts ask the model to use
 * `$$…$$` for any math formula.
 *
 * Safety: react-markdown does not parse raw HTML by default, so
 * `<script>alert(1)</script>` in the markdown source becomes a text
 * node, never an element. The plugin set (gfm, math, katex,
 * external-links) all produce known-safe HAST; no sanitizer needed.
 */
export default function ArticleMarkdown({ children, className }: Props) {
  return (
    <article className={className != null ? `${BASE_CLASS} ${className}` : BASE_CLASS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
        rehypePlugins={[
          rehypeKatex,
          [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
        ]}
      >
        {children}
      </ReactMarkdown>
    </article>
  );
}
