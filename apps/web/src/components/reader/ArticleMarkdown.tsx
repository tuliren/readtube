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
 * LaTeX support via remark-math defaults: inline `$…$` and display
 * `$$…$$`. Known edge cases with the permissive single-`$` tokenizer:
 * prose dollar sign pairs ("$5 for $10") may mis-render as math, and
 * bold around money ("**$2.2M** and **$1.5B**") can be fused into
 * one span. Accepted trade-off — prompts use the conventional
 * single-`$` for inline math, which is what models already emit.
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
        remarkPlugins={[remarkGfm, remarkMath]}
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
