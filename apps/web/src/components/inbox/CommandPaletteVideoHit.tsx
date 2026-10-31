'use client';

import { Fragment, useState } from 'react';

import { CommandItem } from '@/components/ui/command';
import type { VideoSearchHit } from '@/lib/search/types';

/**
 * One video hit row: thumbnail on the left, then title, channel and
 * date, and for description matches a snippet of the matched
 * description fragment so the user can see why a video whose title
 * lacks the query terms is in the list.
 */
export default function CommandPaletteVideoHit({
  hit,
  onSelect,
}: {
  hit: VideoSearchHit;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={`video-${hit.id}`} onSelect={onSelect}>
      <VideoHitThumbnail url={hit.thumbnailUrl} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate">{renderHighlighted(hit.titleHighlight)}</span>
        <span className="truncate text-xs text-muted-foreground">
          {hit.channelName}
          {hit.publishedAt != null &&
            ` · ${new Date(hit.publishedAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}`}
        </span>
        {hit.descriptionSnippet != null && (
          <span className="truncate text-xs italic text-muted-foreground">
            {renderHighlighted(hit.descriptionSnippet)}
          </span>
        )}
      </div>
    </CommandItem>
  );
}

/**
 * 16:9 thumbnail sized to the title + meta lines (h-9 = text-sm line
 * + text-xs line), so it never makes a row taller than its text. A
 * missing or failed image keeps the same footprint as a muted box so
 * titles stay aligned down the list.
 */
function VideoHitThumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);

  if (url == null || failed) {
    return <span className="h-9 w-16 shrink-0 rounded bg-muted" />;
  }

  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      // Bilibili's CDN 403s on non-bilibili Referers; harmless for YouTube.
      referrerPolicy="no-referrer"
      className="h-9 w-16 shrink-0 rounded object-cover"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Render text whose query-term hits are wrapped in `[[` `]]`
 * delimiters (ts_headline output) as bold, highlighted <mark>
 * elements. Splitting on the delimiters keeps the underlying content
 * plain text — markup inside a video title or description can never
 * reach the DOM as HTML.
 */
function renderHighlighted(text: string): React.ReactNode {
  const parts = text.split(/\[\[(.*?)\]\]/g);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark
        key={index}
        className="rounded-sm bg-yellow-100 px-0.5 font-semibold text-foreground dark:bg-yellow-500/25"
      >
        {part}
      </mark>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    )
  );
}
