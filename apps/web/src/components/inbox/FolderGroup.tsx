'use client';

import { useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, FolderIcon, Trash2 } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ChannelData, FolderData } from '@/lib/types';

import DraggableChannelLink from './DraggableChannelLink';

interface Props {
  folder: FolderData;
  channels: ChannelData[];
  unread: number;
  selectedChannelId: string | null;
  isCollapsed: boolean;
  onToggle: () => void;
  onDelete: () => void;
  folders: FolderData[];
  onMoveTo: (channelId: string, folderId: string | null) => void;
}

/**
 * One collapsible folder group in the sidebar. Renders a header row
 * (toggle + folder name + rolled-up unread count + ⋯ menu) and, when
 * expanded, the list of DraggableChannelLink rows that belong to it.
 * The whole group is a droppable target so users can drag a channel
 * from anywhere in the sidebar onto this folder.
 */
export default function FolderGroup({
  folder,
  channels,
  unread,
  selectedChannelId,
  isCollapsed,
  onToggle,
  onDelete,
  folders,
  onMoveTo,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: folder.id });

  return (
    <div className={`mt-2 ${isOver ? 'bg-blue-50/60' : ''}`} ref={setNodeRef}>
      {/*
        The `group` class here is what activates `group-hover:opacity-100`
        on the folder menu button below — without it, the ⋯ button stays
        invisible at opacity-0 and the Delete action is inaccessible.
      */}
      <div className="group flex items-center gap-1 px-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-1 rounded px-1 py-1 text-left text-sm text-gray-700 hover:bg-gray-100"
        >
          {isCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          <FolderIcon className="h-3.5 w-3.5 text-gray-400" />
          <span className="flex-1 truncate font-medium">{folder.name}</span>
          {unread > 0 ? (
            <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-700">
              {unread}
            </span>
          ) : null}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded p-1 text-gray-400 opacity-0 hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
              aria-label="Folder menu"
            >
              <span aria-hidden>⋯</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
        <p className="ml-6 mt-1 px-2 py-1 text-xs text-gray-300">Drop a channel here</p>
      )}
    </div>
  );
}
