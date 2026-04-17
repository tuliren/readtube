'use client';

import { defaultSchema } from 'hast-util-sanitize';
import ReactMarkdown from 'react-markdown';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

interface Props {
  children: string;
  /** Extra classes appended to the default article styling. Used for
   *  per-caller tweaks like the muted color on short summaries. */
  className?: string;
}

const BASE_CLASS = 'prose prose-gray max-w-none font-sans text-[17px] leading-[1.8]';

// MathML tags KaTeX may emit when `output: 'htmlAndMathml'` (the
// default). rehype-katex injects both the visual HTML tree and an
// accessible MathML tree; sanitize would otherwise drop the MathML.
const MATHML_TAGS = [
  'math',
  'annotation',
  'semantics',
  'mrow',
  'mi',
  'mn',
  'mo',
  'ms',
  'mspace',
  'mtext',
  'menclose',
  'merror',
  'mfenced',
  'mfrac',
  'mpadded',
  'mphantom',
  'mroot',
  'msqrt',
  'mstyle',
  'msub',
  'msup',
  'msubsup',
  'mtable',
  'mtd',
  'mtr',
  'munder',
  'mover',
  'munderover',
  'mmultiscripts',
  'maligngroup',
  'malignmark',
];

const MATH_ATTRS = [
  'accent',
  'accentunder',
  'columnalign',
  'columnlines',
  'columnspacing',
  'columnspan',
  'depth',
  'display',
  'displaystyle',
  'encoding',
  'fence',
  'frame',
  'height',
  'href',
  'linethickness',
  'lspace',
  'mathbackground',
  'mathcolor',
  'mathsize',
  'mathvariant',
  'maxsize',
  'minsize',
  'movablelimits',
  'notation',
  'rowalign',
  'rowlines',
  'rowspacing',
  'rowspan',
  'rspace',
  'scriptlevel',
  'separator',
  'stretchy',
  'symmetric',
  'voffset',
  'width',
  'xmlns',
];

// Extend the GH-flavored default schema so rehype-katex's output
// (deterministic KaTeX HTML + MathML) survives sanitization. Sanitize
// runs *after* rehype-katex so any non-math HTML the model may emit
// is still clipped to the allowlist.
const katexSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'span', ...MATHML_TAGS],
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), ['className'], 'style', 'ariaHidden'],
    div: [...(defaultSchema.attributes?.div ?? []), ['className'], 'style', 'ariaHidden'],
    ...Object.fromEntries(MATHML_TAGS.map((tag) => [tag, [['className'], 'style', ...MATH_ATTRS]])),
  },
};

/**
 * Shared Markdown renderer for AI-generated reader content (summaries,
 * articles). Single source of truth for the remark/rehype plugin set
 * and the sanitization policy so we don't ship two different pipelines
 * for content that originates from the same LLM.
 *
 * LaTeX via remark-math: only `$$…$$` delimiters are treated as math
 * (inline when embedded in prose, display when on its own paragraph
 * block). Single-`$` math is disabled because the tokenizer is lax
 * about what it accepts between delimiters — "$5 for $10" would
 * otherwise match as math `5 for `. Disabling singleDollarTextMath
 * keeps prose dollar signs literal no matter how they pair up.
 */
export default function ArticleMarkdown({ children, className }: Props) {
  return (
    <article className={className != null ? `${BASE_CLASS} ${className}` : BASE_CLASS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
        rehypePlugins={[
          rehypeKatex,
          [rehypeSanitize, katexSchema],
          [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
        ]}
      >
        {children}
      </ReactMarkdown>
    </article>
  );
}
