'use client';

import ReactMarkdown from 'react-markdown';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

interface Props {
  children: string;
  /** Extra classes appended to the default article styling. Used for
   *  per-caller tweaks like the muted color on short summaries. */
  className?: string;
}

const BASE_CLASS = 'prose prose-gray max-w-none font-sans text-[17px] leading-[1.8]';

/**
 * Shared Markdown renderer for AI-generated reader content (summaries,
 * articles). Single source of truth for the remark/rehype plugin set
 * and the sanitization policy so we don't ship two different pipelines
 * for content that originates from the same LLM.
 */
export default function ArticleMarkdown({ children, className }: Props) {
  return (
    <article className={className != null ? `${BASE_CLASS} ${className}` : BASE_CLASS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeSanitize,
          [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
        ]}
      >
        {children}
      </ReactMarkdown>
    </article>
  );
}
