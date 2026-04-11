'use client';

import { Bookmark, Check, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import useSWR from 'swr';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isDefaultQuery } from '@/lib/inbox/filter';
import type { InboxQuery, SavedViewData } from '@/lib/types';

import { useInboxQuery } from './useInboxQuery';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) {
      throw new Error(`Request failed (${r.status})`);
    }
    return r.json() as Promise<SavedViewData[]>;
  });

function queryMatches(a: InboxQuery, b: InboxQuery): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Dropdown in the header that lists saved views and lets users save the
 * current filter state as a new view. The core use case: "Starred + last
 * 7 days + tech tag" → "save as Tech Starlist" → it shows up in this
 * menu and one-click re-applies those filters.
 */
export default function SavedViewMenu() {
  const { query, setQuery } = useInboxQuery();
  const { data: views = [], mutate } = useSWR<SavedViewData[]>('/api/saved-views', fetcher);

  async function saveCurrent() {
    if (isDefaultQuery(query)) {
      toast.error('Nothing to save — the current view is the default');
      return;
    }
    const name = window.prompt('Name this view');
    if (name == null || name.trim() === '') {
      return;
    }
    const res = await fetch('/api/saved-views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), query }),
    });
    if (!res.ok) {
      toast.error('Failed to save view');
      return;
    }
    void mutate();
    toast.success(`Saved "${name.trim()}"`);
  }

  async function deleteView(id: string, name: string) {
    if (!window.confirm(`Delete saved view "${name}"?`)) {
      return;
    }
    const res = await fetch(`/api/saved-views/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Failed to delete view');
      return;
    }
    void mutate();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
          <Bookmark className="h-3.5 w-3.5" />
          Views
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Saved views</DropdownMenuLabel>
        {views.length === 0 ? (
          <div className="px-2 py-1 text-xs text-gray-400">No saved views yet</div>
        ) : (
          views.map((view) => {
            const active = queryMatches(view.query, query);
            return (
              <DropdownMenuItem
                key={view.id}
                onSelect={() => setQuery(view.query)}
                className="flex items-center gap-2"
              >
                {active ? (
                  <Check className="h-3.5 w-3.5 text-blue-600" />
                ) : (
                  <span className="w-3.5" />
                )}
                <span className="flex-1 truncate">{view.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void deleteView(view.id, view.name);
                  }}
                  className="text-gray-400 hover:text-red-500"
                  aria-label={`Delete ${view.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void saveCurrent()}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Save current view…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
