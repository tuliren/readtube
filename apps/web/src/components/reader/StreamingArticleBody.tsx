'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { PluggableList } from 'unified';

import { headingDomId } from '@/lib/reader/extractArticleHeadings';

import type { SectionState } from './articleStreamHandler';

interface Props {
  sectionsTotal: number;
  sections: Record<number, SectionState>;
  /** Reduce-pass headings, when available. Falls back to per-section topics. */
  consolidatedHeadings: string[] | null;
}

// Match ArticleMarkdown so the streaming-mode rendering and the final
// rendering are visually identical — only the body composition differs.
const BASE_CLASS =
  'prose prose-gray dark:prose-invert max-w-none font-sans text-[17px] leading-[1.8]';
const EXTERNAL_LINKS_PLUGIN: PluggableList[number] = [
  rehypeExternalLinks,
  { target: '_blank', rel: ['noopener', 'noreferrer'] },
];

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

/** A single animated skeleton paragraph used to fill gaps where one or
 *  more contiguous sections haven't streamed in yet. Consecutive
 *  missing sections collapse into one skeleton — see {@link buildItems}. */
function SkeletonParagraph() {
  return (
    <div className="my-6 animate-pulse space-y-3" aria-hidden>
      {[100, 92, 96, 70].map((w, i) => (
        <div key={i} className="h-4 rounded bg-muted" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function buildSectionMarkdown(sec: SectionState, heading: string | null): string {
  const headingPart = heading != null && heading.trim().length > 0 ? `## ${heading}\n\n` : '';
  return headingPart + sec.body.trim();
}

function makePlugins(hasLatex: boolean): { remark: PluggableList; rehype: PluggableList } {
  const mathPlugin: PluggableList[number] = hasLatex
    ? remarkMath
    : [remarkMath, { singleDollarTextMath: false }];
  return {
    remark: [remarkGfm, mathPlugin],
    rehype: [rehypeKatex, EXTERNAL_LINKS_PLUGIN],
  };
}

/**
 * Per-section rendering used while the map-reduce strategy is still
 * streaming sections. Renders one ReactMarkdown call per arrived section
 * (so each section's `hasLatex` flag is honoured locally) and collapses
 * each contiguous run of missing sections into a single animated
 * skeleton paragraph.
 *
 * Once the workflow finishes, ArticleReader switches back to the
 * canonical `ArticleMarkdown` render of the assembled `content` so any
 * Jaccard heading dedup applied by the assembler shows through.
 */
export default function StreamingArticleBody({
  sectionsTotal,
  sections,
  consolidatedHeadings,
}: Props) {
  const items: React.ReactNode[] = [];
  let inGap = false;
  let gapKey = 0;

  for (let i = 0; i < sectionsTotal; i++) {
    const sec = sections[i];
    if (sec == null) {
      if (!inGap) {
        items.push(<SkeletonParagraph key={`gap-${gapKey++}`} />);
        inGap = true;
      }
      continue;
    }
    inGap = false;
    const heading =
      consolidatedHeadings != null && i < consolidatedHeadings.length
        ? consolidatedHeadings[i]
        : sec.topic;
    const markdown = buildSectionMarkdown(sec, heading);
    const plugins = makePlugins(sec.hasLatex);
    items.push(
      <ReactMarkdown
        key={`sec-${i}`}
        remarkPlugins={plugins.remark}
        rehypePlugins={plugins.rehype}
        components={HEADING_COMPONENTS}
      >
        {markdown}
      </ReactMarkdown>
    );
  }

  // No sections yet (planning fired but nothing has completed) — keep
  // the reader on a single placeholder rather than an empty article.
  if (items.length === 0) {
    items.push(<SkeletonParagraph key="empty" />);
  }

  return <article className={BASE_CLASS}>{items}</article>;
}
