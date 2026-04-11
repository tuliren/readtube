'use client';

import { useDraggable } from '@dnd-kit/core';
import { Check, CircleDashed, FolderIcon, FolderInput, MoreHorizontal, Radio } from 'lucide-react';
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

import { SidebarBadge, SidebarRowContent, sidebarRowClass } from './SidebarRow';

interface Props {
  channel: ChannelData;
  isSelected: boolean;
  folders: FolderData[];
  onMoveTo: (channelId: string, folderId: string | null) => void;
}

/**
 * One channel row in the sidebar. The row is draggable (to move the
 * channel into a folder) AND has a per-row ⋯ actions dropdown (Move to…
 * for now, more actions will land as features ship).
 *
 * setNodeRef + listeners go on the Link only (not the wrapping li), so
 * the ⋯ menu button is a sibling outside the draggable zone — clicking
 * it never accidentally starts a drag, no stopPropagation hack is
 * needed.
 *
 * The row body uses sidebarRowClass + SidebarRowContent so channels
 * share the same padding, icon slot, and active/hover states as every
 * other sidebar row (Views, folder headers, Add channel button).
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
          className={`${sidebarRowClass(isSelected)} flex-1 cursor-grab active:cursor-grabbing`}
          title="Click to open · drag to move to a folder"
        >
          <SidebarRowContent
            icon={Radio}
            label={channel.name}
            trailing={<SidebarBadge count={channel.unreadCount} />}
          />
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
                    <CircleDashed className="mr-2 h-3.5 w-3.5 text-gray-400" />
                  )}
                  (No folder)
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
