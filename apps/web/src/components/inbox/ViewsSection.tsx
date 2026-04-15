'use client';

import {
  Archive,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Inbox as InboxIcon,
  Star,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { useCollapseState } from '@/components/dashboard/CollapseStateContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isDefaultQuery } from '@/lib/inbox/filter';
import type { InboxQuery } from '@/lib/types';

import { useSidebar } from './SidebarContext';
import { SidebarBadge, SidebarRowContent, sidebarRowClass } from './SidebarRow';
import { useInboxQuery } from './useInboxQuery';

interface ViewDef {
  label: string;
  icon: LucideIcon;
  /** The query that pins this view. Also used to decide whether the
   *  current URL matches it. The Inbox row uses an empty object — it's
   *  handled specially in isActive. */
  query: Partial<InboxQuery>;
}

const VIEWS: ViewDef[] = [
  { label: 'Inbox', icon: InboxIcon, query: {} },
  { label: 'Starred', icon: Star, query: { starred: true } },
  { label: 'Read Later', icon: Bookmark, query: { saved: true } },
  { label: 'Archived', icon: Archive, query: { archived: true } },
];

interface Props {
  /** Aggregate unread count across every subscribed channel. Renders as
   *  the badge on the Inbox row. The other view rows don't get counts
   *  yet — that lands with the planned /api/inbox/counts endpoint. */
  inboxUnread: number;
}

/**
 * Sidebar "Views" section — persistent one-click entries for the main
 * triage buckets. Inbox is the first entry (the default view that shows
 * every video from every subscribed channel), followed by the triage-
 * table-backed views.
 *
 * Clicking a view does a full navigation to `/inbox?<key>=1` so the bucket
 * is a clean slate — these sidebar rows are the "jump to a bucket from
 * anywhere" entry points.
 */
export default function ViewsSection({ inboxUnread }: Props) {
  const { query } = useInboxQuery();
  const { collapsed } = useSidebar();
  const { viewsCollapsed, toggleViews } = useCollapseState();

  // The rail-collapsed (icon-only) mode ignores the per-section
  // collapse preference — users can only see icons anyway, so
  // hiding them behind a second collapse would leave the rail empty.
  const sectionCollapsed = !collapsed && viewsCollapsed;

  function isActive(view: ViewDef): boolean {
    // The Inbox view is the "default" view — active iff no filter keys
    // are set. We can't rely on subset-match (every key absent matches
    // subset-of-anything) because an empty query is also a subset of
    // "starred=true", which would light up Inbox while Starred is
    // active.
    if (Object.keys(view.query).length === 0) {
      return isDefaultQuery(query);
    }
    return Object.entries(view.query).every(([k, v]) => query[k as keyof InboxQuery] === v);
  }

  return (
    <div className={collapsed ? 'px-1 pt-4' : 'px-3 pt-4'}>
      {!collapsed && (
        <button
          type="button"
          onClick={toggleViews}
          className="mb-1 flex w-full items-center gap-1 px-2 text-left"
          aria-expanded={!sectionCollapsed}
          aria-label={sectionCollapsed ? 'Expand views' : 'Collapse views'}
        >
          {sectionCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" />
          )}
          <span className="text-base font-semibold text-gray-900">Views</span>
        </button>
      )}
      {sectionCollapsed ? null : (
        <ul className="space-y-0.5">
          {VIEWS.map((view) => {
            const active = isActive(view);
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(view.query)) {
              if (v === true) {
                params.set(k, '1');
              } else if (typeof v === 'string' && v.length > 0) {
                params.set(k, v);
              }
            }
            const qs = params.toString();
            const href = qs.length > 0 ? `/inbox?${qs}` : '/inbox';
            const count = view.label === 'Inbox' ? inboxUnread : 0;
            const Icon = view.icon;

            if (collapsed) {
              return (
                <li key={view.label}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={href}
                        className={`flex items-center justify-center rounded-md p-2 ${
                          active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {view.label}
                      {count > 0 ? ` (${count})` : ''}
                    </TooltipContent>
                  </Tooltip>
                </li>
              );
            }

            return (
              <li key={view.label}>
                <Link href={href} className={sidebarRowClass(active)}>
                  <SidebarRowContent
                    icon={view.icon}
                    label={view.label}
                    trailing={<SidebarBadge count={count} />}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
