'use client';

import ReactMarkdown from 'react-markdown';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { PluggableList } from 'unified';

interface Props {
  children: string;
  /** Extra classes appended to the default article styling. Used for
   *  per-caller tweaks like the muted color on short summaries. */
  className?: string;
  /** When true, enable remark-math + rehype-katex so `$…$` / `$$…$$`
   *  render as LaTeX. When false/undefined, those plugins are skipped
   *  entirely — every dollar sign stays literal, which is the correct
   *  behaviour for plain prose containing money amounts etc. */
  hasLatex?: boolean;
}

const BASE_CLASS =
  'prose prose-gray dark:prose-invert max-w-none font-sans text-[17px] leading-[1.8]';
const EXTERNAL_LINKS_PLUGIN: PluggableList[number] = [
  rehypeExternalLinks,
  { target: '_blank', rel: ['noopener', 'noreferrer'] },
];

/**
 * Shared Markdown renderer for AI-generated reader content (summaries,
 * articles). Single source of truth for the remark/rehype plugin set.
 *
 * LaTeX delimiter behaviour is gated by the `hasLatex` prop:
 *   - `hasLatex: true`  — both `$…$` and `$$…$$` render as math.
 *   - `hasLatex: false` or undefined — only `$$…$$` renders; single-`$`
 *     is disabled via `singleDollarTextMath: false` so prose dollar
 *     sign pairs (`$5 for $10`, `**$2.2M** and **$1.5B**`) stay
 *     literal. Display math still works because `$$…$$` is
 *     unambiguous.
 * The flag originates from the LLM-declared frontmatter — see
 * `lib/markdownFrontmatter.ts`.
 *
 * Safety: react-markdown does not parse raw HTML by default, so
 * `<script>alert(1)</script>` in the source becomes a text node,
 * never an element. No sanitizer needed.
 */
export default function ArticleMarkdown({ children, className, hasLatex }: Props) {
  const mathPlugin: PluggableList[number] = hasLatex
    ? remarkMath
    : [remarkMath, { singleDollarTextMath: false }];
  const remarkPlugins: PluggableList = [remarkGfm, mathPlugin];
  const rehypePlugins: PluggableList = [rehypeKatex, EXTERNAL_LINKS_PLUGIN];
  return (
    <article className={className != null ? `${BASE_CLASS} ${className}` : BASE_CLASS}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {children}
      </ReactMarkdown>
    </article>
  );
}
