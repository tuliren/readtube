'use client';

import ReactMarkdown, { type Components } from 'react-markdown';

import { headingDomId } from '@/lib/reader/extractArticleHeadings';

import { buildMarkdownPlugins } from './articleMarkdownPlugins';

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
  /** When true, tag `##` / `###` headings with line-based DOM ids so
   *  `FloatingToc` can jump to them. Off by default: the Summary and
   *  Article tabs share this renderer but sit in the DOM at the same
   *  time (toggled via CSS `hidden`, not unmounted), so if every
   *  instance stamped ids a `toc-h2-1` in the Summary tab would shadow
   *  `toc-h2-1` in the Article tab and `document.getElementById` would
   *  return a hidden heading. Only the Article tab opts in. */
  enableHeadingIds?: boolean;
}

const BASE_CLASS =
  'prose prose-gray dark:prose-invert max-w-none font-sans text-[17px] leading-[1.8]';

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
 * articles). The remark/rehype plugin set lives in
 * `articleMarkdownPlugins` so this and the streaming renderer stay in
 * lockstep; see that module for the LaTeX-gating and CJK-emphasis
 * rationale.
 *
 * Safety: react-markdown does not parse raw HTML by default, so
 * `<script>alert(1)</script>` in the source becomes a text node,
 * never an element. No sanitizer needed.
 */
export default function ArticleMarkdown({
  children,
  className,
  hasLatex,
  enableHeadingIds,
}: Props) {
  const { remarkPlugins, rehypePlugins } = buildMarkdownPlugins(hasLatex === true);
  return (
    <article className={className != null ? `${BASE_CLASS} ${className}` : BASE_CLASS}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={enableHeadingIds === true ? HEADING_COMPONENTS : undefined}
      >
        {children}
      </ReactMarkdown>
    </article>
  );
}
