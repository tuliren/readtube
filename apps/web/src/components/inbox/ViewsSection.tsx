'use client';

import { Archive, Bookmark, Clock, Star } from 'lucide-react';
import Link from 'next/link';

import type { InboxQuery } from '@/lib/types';

import { useInboxQuery } from './useInboxQuery';

interface ViewDef {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** The query that pins this view. Used both for the href and for
   *  deciding whether the current URL matches it. */
  query: Partial<InboxQuery>;
}

const VIEWS: ViewDef[] = [
  { label: 'Starred', icon: Star, query: { starred: true } },
  { label: 'Read Later', icon: Bookmark, query: { saved: true } },
  { label: 'Snoozed', icon: Clock, query: { snoozed: true } },
  { label: 'Archived', icon: Archive, query: { archived: true } },
];

/**
 * Sidebar "Views" section — persistent one-click entries for the triage
 * buckets that don't have a dedicated page. Clicking a view navigates to
 * `/inbox?{key}=1`. FilterBar already handles the toggles inside /inbox,
 * so this is just a durable shortcut for users who expect their
 * Read-Later list to be one click away from anywhere in the sidebar.
 */
export default function ViewsSection() {
  const { query } = useInboxQuery();

  function isActive(view: ViewDef): boolean {
    // Active iff every key in the view's query matches the URL's query.
    // We intentionally don't require a full-object equality — a user can
    // layer additional filters on top (e.g. Starred + Unread) and the
    // Starred view stays highlighted.
    return Object.entries(view.query).every(([k, v]) => query[k as keyof InboxQuery] === v);
  }

  return (
    <div className="px-3 pt-4">
      <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Views
      </p>
      <ul className="space-y-0.5">
        {VIEWS.map((view) => {
          const Icon = view.icon;
          const active = isActive(view);
          const params = new URLSearchParams();
          for (const [k, v] of Object.entries(view.query)) {
            if (v === true) {
              params.set(k, '1');
            } else if (typeof v === 'string' && v.length > 0) {
              params.set(k, v);
            }
          }
          const href = `/inbox?${params.toString()}`;

          return (
            <li key={view.label}>
              <Link
                href={href}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                  active
                    ? 'bg-blue-50 font-medium text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                {view.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
