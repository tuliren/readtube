'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { bestMatchScore } from '@/lib/search/matchScore';
import type { SearchResponse, VideoSearchHit } from '@/lib/search/types';
import { channelHref } from '@/lib/urls/channelHref';

import ChannelAvatar from './ChannelAvatar';

/**
 * A palette entry registered by a feature component via `useCommand`.
 * Lives here (not in CommandPalette.tsx) so the registry module can
 * import the dialog without an import cycle.
 */
export interface CommandItemInfo {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  shortcut?: string;
  run: () => void;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) {
      throw new Error(`Fetch error: ${r.status}`);
    }
    return r.json();
  });

/** Delay before a keystroke turns into a /api/search request. */
const SEARCH_DEBOUNCE_MS = 200;

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface Props {
  items: CommandItemInfo[];
  open: boolean;
  setOpen: (open: boolean) => void;
}

/**
 * ⌘K palette body: a server-backed search over the user's channels and
 * videos, plus any commands feature components registered via
 * `useCommand`. Search hits come pre-ranked from /api/search (channels
 * by match position, videos by ts_rank), so cmdk's own fuzzy filter is
 * disabled — it would re-filter the ranked rows against the raw input
 * and drop stemmed matches like "running" → "run".
 */
export default function CommandPaletteDialog({ items, open, setOpen }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, SEARCH_DEBOUNCE_MS);

  // Fresh input on every open — a stale query from the previous
  // session would immediately refetch and flash old results.
  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  // keepPreviousData holds the last result set while the next
  // keystroke's fetch is in flight, so the list updates in place
  // instead of flashing empty on every character.
  const { data } = useSWR<SearchResponse>(
    open && debounced.length > 0 ? `/api/search?q=${encodeURIComponent(debounced)}` : null,
    fetcher,
    { keepPreviousData: true }
  );

  // Where the reader's Back link should land after opening a video hit.
  // Mirrors VideoList: forward an existing returnTo verbatim (palette
  // opened from inside the reader), otherwise the current list URL.
  const returnTo = useMemo(() => {
    const existing = searchParams.get('returnTo');
    if (existing != null && existing.length > 0) {
      return existing;
    }
    const listParams = new URLSearchParams(searchParams);
    listParams.delete('returnTo');
    const qs = listParams.toString();
    return qs.length > 0 ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  // Registered commands are filtered in-process (they never hit the
  // server): empty query shows all of them, otherwise substring match
  // on label + keywords.
  const matchingCommands = useMemo(() => {
    if (trimmed.length === 0) {
      return items;
    }
    return items.filter((item) => bestMatchScore([item.label, item.keywords], trimmed) > 0);
  }, [items, trimmed]);

  const commandsByGroup = useMemo(() => {
    const byGroup = new Map<string, CommandItemInfo[]>();
    for (const item of matchingCommands) {
      const existing = byGroup.get(item.group) ?? [];
      existing.push(item);
      byGroup.set(item.group, existing);
    }
    return byGroup;
  }, [matchingCommands]);

  const searching = trimmed.length > 0;
  const channelHits = searching ? (data?.channels ?? []) : [];
  const videoHits = searching ? (data?.videos ?? []) : [];
  // Separate sections per matched field so a hit whose visible title
  // doesn't contain the query terms isn't mystifying. Title matches
  // come first (the server orders them first too).
  const titleHits = videoHits.filter((hit) => hit.matchedBy === 'title');
  const descriptionHits = videoHits.filter((hit) => hit.matchedBy === 'description');
  const hasResults = channelHits.length > 0 || videoHits.length > 0 || matchingCommands.length > 0;

  // cmdk auto-selects the first item only when ITS filter runs; with
  // shouldFilter=false and results arriving async, the selection stays
  // empty and Enter does nothing. Control the selection ourselves:
  // whenever the top hit changes, point the selection at it. Arrowing
  // within an unchanged result set doesn't retrigger this (firstValue
  // is stable), so manual navigation isn't fought.
  const [selectedValue, setSelectedValue] = useState('');
  const firstValue =
    channelHits.length > 0
      ? `channel-${channelHits[0].id}`
      : videoHits.length > 0
        ? `video-${videoHits[0].id}`
        : matchingCommands.length > 0
          ? `command-${matchingCommands[0].id}`
          : '';
  useEffect(() => {
    setSelectedValue(firstValue);
  }, [firstValue]);

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      commandProps={{
        shouldFilter: false,
        value: selectedValue,
        onValueChange: setSelectedValue,
      }}
    >
      <CommandInput
        placeholder="Search videos and channels..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {/* cmdk's CommandEmpty keys off its internal filter, which is
            disabled here — render empty/hint states manually instead. */}
        {!hasResults && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {!searching
              ? 'Type to search your videos and channels.'
              : data == null
                ? 'Searching...'
                : 'No results found.'}
          </p>
        )}
        {channelHits.length > 0 && (
          <CommandGroup heading="Channels">
            {channelHits.map((hit) => (
              <CommandItem
                key={hit.id}
                value={`channel-${hit.id}`}
                onSelect={() => navigate(channelHref(hit))}
              >
                {hit.logoUrl != null ? (
                  <ChannelAvatar url={hit.logoUrl} size={40} cssSize="h-5 w-5" />
                ) : (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                    {hit.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate">{hit.name}</span>
                {hit.handle != null && (
                  <span className="truncate text-xs text-muted-foreground">{hit.handle}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {titleHits.length > 0 && (
          <CommandGroup heading="Videos (by title)">
            {titleHits.map((hit) => (
              <VideoHitItem
                key={hit.id}
                hit={hit}
                onSelect={() =>
                  navigate(
                    `/videos/${encodeURIComponent(hit.sourceId)}?returnTo=${encodeURIComponent(returnTo)}`
                  )
                }
              />
            ))}
          </CommandGroup>
        )}
        {descriptionHits.length > 0 && (
          <CommandGroup heading="Videos (by description)">
            {descriptionHits.map((hit) => (
              <VideoHitItem
                key={hit.id}
                hit={hit}
                onSelect={() =>
                  navigate(
                    `/videos/${encodeURIComponent(hit.sourceId)}?returnTo=${encodeURIComponent(returnTo)}`
                  )
                }
              />
            ))}
          </CommandGroup>
        )}
        {Array.from(commandsByGroup.entries()).map(([groupName, groupItems]) => (
          <CommandGroup key={groupName} heading={groupName}>
            {groupItems.map((item) => (
              <CommandItem
                key={item.id}
                value={`command-${item.id}`}
                onSelect={() => {
                  setOpen(false);
                  item.run();
                }}
              >
                <span>{item.label}</span>
                {item.shortcut != null && (
                  <span className="ml-auto text-xs text-muted-foreground">{item.shortcut}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

/**
 * One video hit row: title, then channel and date, and for
 * description matches a snippet of the matched description fragment
 * so the user can see why a video whose title lacks the query terms
 * is in the list.
 */
function VideoHitItem({ hit, onSelect }: { hit: VideoSearchHit; onSelect: () => void }) {
  return (
    <CommandItem value={`video-${hit.id}`} onSelect={onSelect}>
      <div className="flex min-w-0 flex-col">
        <span className="truncate">{hit.title}</span>
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
            {renderSnippet(hit.descriptionSnippet)}
          </span>
        )}
      </div>
    </CommandItem>
  );
}

/**
 * Render a ts_headline snippet whose hit terms are wrapped in
 * `[[` `]]` delimiters. Splitting on the delimiters and emitting
 * <mark> elements keeps the description content as plain text —
 * markup inside a video description can never reach the DOM as HTML.
 */
function renderSnippet(snippet: string): React.ReactNode {
  const parts = snippet.split(/\[\[(.*?)\]\]/g);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="rounded-sm bg-transparent font-medium text-foreground">
        {part}
      </mark>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    )
  );
}
