import rehypeExternalLinks from 'rehype-external-links';
import rehypeKatex from 'rehype-katex';
// parseOnly: we only render markdown -> HTML, never serialize mdast
// back to markdown, so the lighter parse-only build (micromark
// extension only) is all we need.
import remarkCjkFriendly from 'remark-cjk-friendly/parseOnly';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { PluggableList } from 'unified';

const EXTERNAL_LINKS_PLUGIN: PluggableList[number] = [
  rehypeExternalLinks,
  { target: '_blank', rel: ['noopener', 'noreferrer'] },
];

/**
 * Shared remark/rehype plugin set for AI-generated reader content. Both
 * the final render (`ArticleMarkdown`) and the streaming render
 * (`StreamingArticleBody`) build from this so they can never drift —
 * the streaming and final passes must be visually identical.
 *
 * `remarkCjkFriendly` fixes `**bold**` / `*italic*` adjacent to CJK
 * characters and full-width punctuation. CommonMark's flanking rules
 * treat a `**` wedged between an ideograph and CJK punctuation (e.g.
 * `了**"…"**。`) as neither opening nor closing, so the markers render
 * literally and an unrelated span gets emphasized instead. This is
 * common in Chinese/Japanese/Korean summaries.
 *
 * LaTeX delimiter behaviour is gated by `hasLatex`:
 *   - true  — both `$…$` and `$$…$$` render as math.
 *   - false — only `$$…$$` renders; single-`$` is disabled so prose
 *     dollar pairs (`$5 for $10`) stay literal.
 */
export function buildMarkdownPlugins(hasLatex: boolean): {
  remarkPlugins: PluggableList;
  rehypePlugins: PluggableList;
} {
  const mathPlugin: PluggableList[number] = hasLatex
    ? remarkMath
    : [remarkMath, { singleDollarTextMath: false }];
  return {
    remarkPlugins: [remarkGfm, remarkCjkFriendly, mathPlugin],
    rehypePlugins: [rehypeKatex, EXTERNAL_LINKS_PLUGIN],
  };
}
