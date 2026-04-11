'use client';

import { useDraggable } from '@dnd-kit/core';
import { Check, FolderIcon, FolderInput, Inbox, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ChannelData, FolderData } from '@/lib/types';

interface Props {
  channel: ChannelData;
  isSelected: boolean;
  folders: FolderData[];
  onMoveTo: (channelId: string, folderId: string | null) => void;
}

/**
 * One channel row in the sidebar. The row is draggable (to move the
 * channel into a folder) AND has a per-row "Move to…" dropdown (for
 * users who'd rather pick a destination from a menu).
 *
 * setNodeRef + listeners go on the Link only (not the wrapping li), so
 * the Move-to dropdown button is a sibling outside the draggable zone —
 * clicking it never accidentally starts a drag, no stopPropagation hack
 * is needed.
 */
export default function DraggableChannelLink({ channel, isSelected, folders, onMoveTo }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: channel.id,
  });

  return (
    <li className={`group relative ${isDragging ? 'opacity-40' : ''}`}>
      <div className="flex items-center">
        <Link
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          href={`/inbox?channel=${channel.id}`}
          className={`flex flex-1 items-center justify-between rounded-md px-3 py-1.5 text-sm cursor-grab active:cursor-grabbing ${
            isSelected ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-100'
          }`}
          title="Click to open · drag to move to a folder"
        >
          <span className="truncate">{channel.name}</span>
          {channel.unreadCount > 0 && (
            <span className="ml-1 shrink-0 rounded-full bg-blue-600 px-1.5 py-0.5 text-xs font-medium text-white">
              {channel.unreadCount}
            </span>
          )}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-0.5 rounded p-1 text-gray-400 opacity-0 hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100 data-[state=open]:opacity-100"
              aria-label="Channel actions"
              title="Channel actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/*
              "Move to folder" is a nested submenu so the top level stays
              tidy as more per-channel actions land (rename, mute,
              priority, unsubscribe, etc. — see inbox plan file).
            */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="mr-2 h-3.5 w-3.5 text-gray-500" />
                Move to folder
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                <DropdownMenuItem
                  disabled={channel.folderId == null}
                  onSelect={() => onMoveTo(channel.id, null)}
                >
                  {channel.folderId == null ? (
                    <Check className="mr-2 h-3.5 w-3.5 text-blue-600" />
                  ) : (
                    <Inbox className="mr-2 h-3.5 w-3.5 text-gray-400" />
                  )}
                  Inbox (no folder)
                </DropdownMenuItem>
                {folders.map((folder) => {
                  const isCurrent = channel.folderId === folder.id;
                  return (
                    <DropdownMenuItem
                      key={folder.id}
                      disabled={isCurrent}
                      onSelect={() => onMoveTo(channel.id, folder.id)}
                    >
                      {isCurrent ? (
                        <Check className="mr-2 h-3.5 w-3.5 text-blue-600" />
                      ) : (
                        <FolderIcon className="mr-2 h-3.5 w-3.5 text-gray-400" />
                      )}
                      <span className="truncate">{folder.name}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
