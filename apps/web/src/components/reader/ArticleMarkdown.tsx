'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { PluggableList } from 'unified';

import { headingDomId } from '@/lib/reader/extractArticleHeadings';

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

// Heading components tag each `##` / `###` with a stable DOM id derived
// from its source line number. `FloatingToc` scrolls to these ids when
// the reader clicks a TOC entry, and uses the same ids as its
// IntersectionObserver targets. `scroll-mt-20` keeps the target from
// disappearing behind the sticky reader header on smooth scroll.
const HEADING_COMPONENTS: Components = {
  h2: ({ node, children, ...props }) => {
    const line = node?.position?.start?.line ?? 0;
    return (
      <h2 id={headingDomId(2, line)} className="scroll-mt-20" {...props}>
        {children}
      </h2>
    );
  },
  h3: ({ node, children, ...props }) => {
    const line = node?.position?.start?.line ?? 0;
    return (
      <h3 id={headingDomId(3, line)} className="scroll-mt-20" {...props}>
        {children}
      </h3>
    );
  },
};

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
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={HEADING_COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </article>
  );
}
