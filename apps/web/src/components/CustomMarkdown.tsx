import { FC } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

interface CustomMarkdownProps {
  markdown: string;
  /** Wrapper classes. Defaults to Tailwind Typography's `prose`. */
  className?: string;
  /** Per-element overrides, for callers that style elements themselves. */
  components?: Components;
}

const CustomMarkdown: FC<CustomMarkdownProps> = ({
  markdown,
  className = 'prose mx-auto dark:prose-invert',
  components,
}) => {
  return (
    <div className={className}>
      <ReactMarkdown
        components={components}
        rehypePlugins={[
          remarkGfm,
          rehypeRaw,
          rehypeSanitize,
          [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
        ]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
};

export default CustomMarkdown;
