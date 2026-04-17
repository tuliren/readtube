'use client';

import ReactMarkdown from 'react-markdown';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';

interface Props {
  children: string;
  /** Extra classes appended to the default article styling. Used for
   *  per-caller tweaks like the muted color on short summaries. */
  className?: string;
}

const BASE_CLASS = 'prose prose-gray max-w-none font-sans text-[17px] leading-[1.8]';

/**
 * Pandoc-style filter over remark-math's output. remark-math's
 * default tokenizer pairs any two `$` signs regardless of surrounding
 * whitespace, which mis-renders "$5 for $10" as math `5 for `. This
 * plugin reverts any inlineMath whose content starts or ends with
 * whitespace back to literal text — the strong signal that the
 * delimiters were prose dollar signs, not math.
 */
function remarkStrictInlineMath() {
  return (tree: unknown, file: { value: unknown }) => {
    const source = String(file.value);
    visit(tree as never, 'inlineMath', (node: never, index, parent) => {
      if (parent == null || index == null) {
        return;
      }
      const position = (
        node as { position?: { start: { offset?: number }; end: { offset?: number } } }
      ).position;
      const startOffset = position?.start.offset;
      const endOffset = position?.end.offset;
      if (startOffset == null || endOffset == null) {
        return;
      }
      // Count leading `$`s to find the delimiter size. `$$...$$` is
      // unambiguous so we leave it alone; the pandoc rule only
      // applies to single-`$` pairs.
      let delim = 0;
      while (source[startOffset + delim] === '$') {
        delim++;
      }
      if (delim !== 1) {
        return;
      }
      const afterOpen = source[startOffset + 1] ?? '';
      const beforeClose = source[endOffset - 2] ?? '';
      if (!/\s/.test(afterOpen) && !/\s/.test(beforeClose)) {
        return;
      }
      (parent as { children: unknown[] }).children[index] = {
        type: 'text',
        value: source.slice(startOffset, endOffset),
      };
    });
  };
}

/**
 * Shared Markdown renderer for AI-generated reader content (summaries,
 * articles). Single source of truth for the remark/rehype plugin set
 * so we don't ship two different pipelines for content that originates
 * from the same LLM.
 *
 * Note on safety: react-markdown does not parse raw HTML by default —
 * `<script>alert(1)</script>` in the markdown source becomes a text
 * node, not an element. Plugins in this pipeline (gfm, math, katex,
 * external-links) all produce known-safe HAST, so no sanitizer is
 * needed.
 *
 * LaTeX via remark-math:
 *   - `$$…$$` always renders as math (inline when embedded in prose,
 *     display when on its own paragraph).
 *   - `$…$` renders as math only if the content has no whitespace
 *     immediately after the opening `$` or before the closing `$`
 *     (Pandoc convention). "$5 for $10", "$5", and "$ x $" all stay
 *     literal; "$E = mc^2$" renders as inline math.
 */
export default function ArticleMarkdown({ children, className }: Props) {
  return (
    <article className={className != null ? `${BASE_CLASS} ${className}` : BASE_CLASS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkStrictInlineMath]}
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
