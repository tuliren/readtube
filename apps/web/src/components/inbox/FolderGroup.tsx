'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  ChevronDown,
  ChevronRight,
  FolderIcon,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ChannelData, FolderData } from '@/lib/types';

import DraggableChannelLink from './DraggableChannelLink';
import { SidebarBadge, sidebarRowClass } from './SidebarRow';

interface Props {
  folder: FolderData;
  channels: ChannelData[];
  unread: number;
  selectedChannelId: string | null;
  isCollapsed: boolean;
  onToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
  folders: FolderData[];
  onMoveTo: (channelId: string, folderId: string | null) => void;
}

/**
 * One collapsible folder group in the sidebar. Header row (toggle +
 * folder icon + name + rolled-up unread badge + ⋯ menu) and, when
 * expanded, the list of DraggableChannelLink rows that belong to it.
 * The whole group is a droppable target so users can drag a channel
 * from anywhere in the sidebar onto this folder.
 *
 * The header uses sidebarRowClass so folders share the same padding,
 * hover, and icon slot as every other sidebar row. The chevron sits at
 * h-3.5 w-3.5 (smaller than the row icon) because it's an affordance,
 * not a category label. The unread badge uses SidebarBadge — same blue
 * as channel and Inbox badges, no more gray-200 folder badges.
 */
export default function FolderGroup({
  folder,
  channels,
  unread,
  selectedChannelId,
  isCollapsed,
  onToggle,
  onRename,
  onDelete,
  folders,
  onMoveTo,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: folder.id });

  return (
    // px-3 lives on the outer wrapper (rather than each inner row) so
    // every action button in this folder — the header ⋯ menu and each
    // channel-row ⋯ menu — sits at the same 12px-from-right rail as
    // the New-folder button up in the Channels header. Without this
    // the folder-children channel rows would extend to 0px because
    // their <ul> has no horizontal padding.
    <div className={`mt-2 px-3 ${isOver ? 'bg-blue-50/60' : ''}`} ref={setNodeRef}>
      {/*
        The `group` class here is what activates `group-hover:opacity-100`
        on the folder menu button below — without it the ⋯ button stays
        invisible and the Delete action is inaccessible.
      */}
      <div className="group flex items-center">
        <button
          type="button"
          onClick={onToggle}
          className={`${sidebarRowClass(false)} flex-1 text-left`}
        >
          {isCollapsed ? (
            <ChevronRight className="-ml-1 h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronDown className="-ml-1 h-3.5 w-3.5 shrink-0" />
          )}
          <FolderIcon className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="flex-1 truncate font-semibold text-gray-900">{folder.name}</span>
          <SidebarBadge count={unread} />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-0.5 rounded p-1 text-gray-400 opacity-0 hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100 data-[state=open]:opacity-100"
              aria-label="Folder menu"
              title="Folder actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onRename}>
              <Pencil className="mr-2 h-4 w-4" />
              Rename folder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!isCollapsed && channels.length > 0 && (
        <ul className="ml-5 mt-1 space-y-0.5 border-l border-gray-200 pl-2">
          {channels.map((channel) => (
            <DraggableChannelLink
              key={channel.id}
              channel={channel}
              isSelected={selectedChannelId === channel.id}
              folders={folders}
              onMoveTo={onMoveTo}
            />
          ))}
        </ul>
      )}
      {!isCollapsed && channels.length === 0 && (
        <p className="ml-6 mt-1 px-3 py-1 text-xs text-gray-500">
          No channels yet — drag any channel here to add it.
        </p>
      )}
    </div>
  );
}
