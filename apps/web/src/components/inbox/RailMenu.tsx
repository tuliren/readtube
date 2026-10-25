'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { railItemClass } from './SidebarRow';

interface RailMenuProps {
  icon: LucideIcon;
  /** Category name: the trigger's tooltip and the menu's heading. */
  label: string;
  /** Highlight the trigger when the current page is inside this category. */
  active: boolean;
  children: React.ReactNode;
}

/**
 * One category in the collapsed sidebar rail (Playlists, Channels). A
 * single icon opens a menu to the right listing the category's items,
 * so the rail stays a short, fixed list instead of one icon per item.
 */
export function RailMenu({ icon: Icon, label, active, children }: RailMenuProps) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={label}
              className={cn(
                railItemClass(active),
                // Full width like the rail's Link items, so the icon
                // centers; a button otherwise shrinks to its content.
                'w-full data-[state=open]:bg-accent data-[state=open]:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="right" align="start" className="w-64">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface RailMenuLinkProps {
  href: string;
  label: string;
  /** Avatar, thumbnail, or icon shown before the label. */
  leading: React.ReactNode;
  unread: number;
  active: boolean;
}

/** A navigable row inside a rail menu, with an optional unread count. */
export function RailMenuLink({ href, label, leading, unread, active }: RailMenuLinkProps) {
  return (
    <DropdownMenuItem asChild>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn('flex items-center gap-2', active && 'bg-accent font-medium')}
      >
        <RailMenuRowContent leading={leading} label={label} unread={unread} />
      </Link>
    </DropdownMenuItem>
  );
}

/** Leading visual, truncated label, and trailing unread count. */
export function RailMenuRowContent({
  leading,
  label,
  unread,
}: Pick<RailMenuLinkProps, 'leading' | 'label' | 'unread'>) {
  return (
    <>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{leading}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {unread > 0 && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{unread}</span>
      )}
    </>
  );
}
