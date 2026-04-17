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
 * Escape prose dollar signs before remark-math sees them. A `$`
 * followed immediately by a digit is almost always money ("$2.2
 * million", "$5", "$100"), never the opener of real math. Escaping
 * these up front has two benefits:
 *   1. remark-math never mis-pairs "$2.2 million** and **$1.5 billion"
 *      into a single math span that destroys the surrounding bolds.
 *   2. lone prose dollar signs stay literal without relying on the
 *      tokenizer failing to find a closer.
 *
 * The negative lookbehind avoids touching `$$` (display math opener)
 * or `\$` (already-escaped). Tradeoff: inline math that opens on a
 * digit ("$1+1=2$") must use `$$…$$` instead — rare enough to accept.
 */
function escapeProseDollars(markdown: string): string {
  return markdown.replace(/(?<![\\$])\$(?=\d)/g, '\\$');
}

/**
 * Backstop for prose dollar signs that slip past escapeProseDollars
 * (e.g. "$x$" where "x" is non-digit but surrounded by whitespace).
 * Reverts inlineMath nodes whose source span violates Pandoc's
 * delimiter rules. Kept as defense-in-depth; the real work happens
 * in the preprocessor.
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
      let delim = 0;
      while (source[startOffset + delim] === '$') {
        delim++;
      }
      if (delim !== 1) {
        return;
      }
      const raw = source.slice(startOffset, endOffset);
      const inner = raw.slice(1, -1);
      const looseBoundary = /^\s|\s$/.test(inner);
      const crossesEmphasis = /\*\*|__/.test(inner);
      if (!looseBoundary && !crossesEmphasis) {
        return;
      }
      (parent as { children: unknown[] }).children[index] = { type: 'text', value: raw };
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
  const preprocessed = escapeProseDollars(children);
  return (
    <article className={className != null ? `${BASE_CLASS} ${className}` : BASE_CLASS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkStrictInlineMath]}
        rehypePlugins={[
          rehypeKatex,
          [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
        ]}
      >
        {preprocessed}
      </ReactMarkdown>
    </article>
  );
}
