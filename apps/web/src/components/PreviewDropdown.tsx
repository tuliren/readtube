'use client';

import { ChevronDown } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buildThumbnailUrl } from '@/lib/platforms/youtube/urls';

export interface PreviewItem {
  title: string;
  id: string;
}

interface Props {
  items: readonly PreviewItem[];
}

export default function PreviewDropdown({ items }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group inline-flex items-center justify-center gap-1 rounded-full px-4 py-2 text-sm text-slate-700 ring-1 ring-slate-200 hover:text-slate-900 hover:ring-slate-300 active:bg-slate-100 active:text-slate-600 focus:outline-none focus-visible:outline-blue-600 focus-visible:ring-slate-300 dark:text-slate-300 dark:ring-slate-700 dark:hover:text-slate-100 dark:hover:ring-slate-600 dark:active:bg-slate-800 dark:active:text-slate-400">
        Preview
        <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" sideOffset={8} className="w-80">
        {items.map((item) => (
          <DropdownMenuItem key={item.id} asChild>
            <a
              href={`/p/videos/${item.id}?language=en`}
              target="_blank"
              rel="noopener noreferrer"
              className="gap-3"
            >
              <img
                src={buildThumbnailUrl(item.id)}
                alt=""
                aria-hidden
                referrerPolicy="no-referrer"
                className="h-10 w-16 shrink-0 rounded object-cover"
                loading="lazy"
              />
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
