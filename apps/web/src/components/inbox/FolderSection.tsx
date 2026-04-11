'use client';

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { ChevronDown, ChevronRight, FolderIcon, FolderPlus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ChannelData, FolderData } from '@/lib/types';

import { useFolders } from './useFolders';

interface Props {
  channels: ChannelData[];
  selectedChannelId: string | null;
}

/**
 * Folder-aware channel list. Channels are grouped under their folder_id; any
 * channel without a folder_id shows up in the "Inbox" (root) group at the
 * top. Drag a channel row onto a folder to move it; drop on "Inbox" to
 * unassign.
 *
 * Collapsible folders + per-folder unread rollups are local-state only —
 * expand state isn't persisted across reloads yet.
 */
export default function FolderSection({ channels, selectedChannelId }: Props) {
  const { folders, create, remove, moveChannel } = useFolders();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  function toggleCollapsed(folderId: string) {
    setCollapsed((prev) => {
      const copy = new Set(prev);
      if (copy.has(folderId)) {
        copy.delete(folderId);
      } else {
        copy.add(folderId);
      }
      return copy;
    });
  }

  async function handleCreate() {
    const name = window.prompt('New folder name');
    if (name == null || name.trim() === '') {
      return;
    }
    await create(name);
  }

  async function handleDelete(folderId: string) {
    const ok = window.confirm('Delete this folder? Channels inside will move back to Inbox.');
    if (!ok) {
      return;
    }
    await remove(folderId);
  }

  function handleDragEnd(event: DragEndEvent) {
    const channelId = event.active.id as string;
    const dropTarget = event.over?.id as string | undefined;
    if (dropTarget == null) {
      return;
    }
    // "root" is the sentinel for unassigning (drop zone for the Inbox bucket)
    const nextFolderId = dropTarget === 'root' ? null : dropTarget;
    const current = channels.find((c) => c.id === channelId);
    if (current == null || current.folderId === nextFolderId) {
      return;
    }
    void moveChannel(channelId, nextFolderId);
  }

  // Partition channels by folder. We treat "unknown folder id" as root so
  // that channels stay visible in two cases:
  //   1. Initial render: channels come from SSR fallback data already
  //      populated, but `folders` is [] until the client-side /api/folders
  //      fetch completes. Without this fallback, foldered channels would
  //      flash out of view for the first 100ms.
  //   2. Stale state: a folder was deleted in another tab; its channels
  //      still carry the old folder_id until the next /api/channels
  //      revalidation. We'd rather show them at root than hide them.
  const folderIds = new Set(folders.map((f) => f.id));
  const rootChannels = channels.filter((c) => c.folderId == null || !folderIds.has(c.folderId));
  const byFolder = new Map<string, ChannelData[]>();
  for (const channel of channels) {
    if (channel.folderId == null || !folderIds.has(channel.folderId)) {
      continue;
    }
    const existing = byFolder.get(channel.folderId) ?? [];
    existing.push(channel);
    byFolder.set(channel.folderId, existing);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex items-center justify-between px-5 pt-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Channels</p>
        <button
          type="button"
          onClick={() => void handleCreate()}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="New folder"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Root (unfoldered) channels */}
      <RootDropZone>
        {rootChannels.length === 0 ? (
          <p className="px-5 py-1 text-xs text-gray-300">
            Drop channels here for the root Inbox bucket
          </p>
        ) : (
          <ul className="space-y-0.5">
            {rootChannels.map((channel) => (
              <DraggableChannelLink
                key={channel.id}
                channel={channel}
                isSelected={selectedChannelId === channel.id}
              />
            ))}
          </ul>
        )}
      </RootDropZone>

      {/* Folders */}
      {folders.map((folder) => {
        const folderChannels = byFolder.get(folder.id) ?? [];
        const folderUnread = folderChannels.reduce((sum, c) => sum + c.unreadCount, 0);
        const isCollapsed = collapsed.has(folder.id);

        return (
          <FolderGroup
            key={folder.id}
            folder={folder}
            channels={folderChannels}
            unread={folderUnread}
            selectedChannelId={selectedChannelId}
            isCollapsed={isCollapsed}
            onToggle={() => toggleCollapsed(folder.id)}
            onDelete={() => void handleDelete(folder.id)}
          />
        );
      })}
    </DndContext>
  );
}

function RootDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'root' });
  return (
    <div ref={setNodeRef} className={`mt-1 ${isOver ? 'bg-blue-50/60' : ''}`}>
      {children}
    </div>
  );
}

interface FolderGroupProps {
  folder: FolderData;
  channels: ChannelData[];
  unread: number;
  selectedChannelId: string | null;
  isCollapsed: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

function FolderGroup({
  folder,
  channels,
  unread,
  selectedChannelId,
  isCollapsed,
  onToggle,
  onDelete,
}: FolderGroupProps) {
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

interface DraggableChannelProps {
  channel: ChannelData;
  isSelected: boolean;
}

function DraggableChannelLink({ channel, isSelected }: DraggableChannelProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: channel.id,
  });

  return (
    <li ref={setNodeRef} {...attributes} {...listeners} className={isDragging ? 'opacity-50' : ''}>
      <Link
        href={`/inbox?channel=${channel.id}`}
        className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm ${
          isSelected ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        <span className="truncate">{channel.name}</span>
        {channel.unreadCount > 0 && (
          <span className="ml-1 shrink-0 rounded-full bg-blue-600 px-1.5 py-0.5 text-xs font-medium text-white">
            {channel.unreadCount}
          </span>
        )}
      </Link>
    </li>
  );
}
