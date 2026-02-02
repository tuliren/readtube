import { FC } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

interface CustomMarkdownProps {
  markdown: string;
}

const CustomMarkdown: FC<CustomMarkdownProps> = ({ markdown }) => {
  return (
    <div className="prose mx-auto">
      <ReactMarkdown
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
