'use client';

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  Check,
  ChevronDown,
  ChevronRight,
  FolderIcon,
  FolderInput,
  FolderPlus,
  Inbox,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // The channel currently being dragged (if any). Used to render the
  // floating DragOverlay preview that follows the cursor.
  const activeChannel = useMemo(
    () =>
      activeChannelId != null ? (channels.find((c) => c.id === activeChannelId) ?? null) : null,
    [activeChannelId, channels]
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

  function handleDragStart(event: DragStartEvent) {
    setActiveChannelId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveChannelId(null);
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

  function handleDragCancel() {
    setActiveChannelId(null);
  }

  /**
   * Imperative "move to" from the per-row dropdown. Same guard as the
   * drag handler — skip if the target is the channel's current folder.
   */
  function moveTo(channelId: string, folderId: string | null) {
    const current = channels.find((c) => c.id === channelId);
    if (current == null || current.folderId === folderId) {
      return;
    }
    void moveChannel(channelId, folderId);
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
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
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
                folders={folders}
                onMoveTo={moveTo}
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
            folders={folders}
            onMoveTo={moveTo}
          />
        );
      })}

      {/*
        Portal-rendered floating preview that follows the cursor during
        drag. Without this, the source row only fades via isDragging
        opacity but nothing actually moves with the pointer, which is
        why the raw useDraggable behavior looked broken/unintuitive.
      */}
      <DragOverlay dropAnimation={null}>
        {activeChannel != null ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 shadow-lg ring-2 ring-blue-200 cursor-grabbing">
            <FolderInput className="h-3.5 w-3.5 shrink-0 text-blue-400" />
            <span className="truncate">{activeChannel.name}</span>
            {activeChannel.unreadCount > 0 && (
              <span className="ml-auto shrink-0 rounded-full bg-blue-600 px-1.5 py-0.5 text-xs font-medium text-white">
                {activeChannel.unreadCount}
              </span>
            )}
          </div>
        ) : null}
      </DragOverlay>
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
  folders: FolderData[];
  onMoveTo: (channelId: string, folderId: string | null) => void;
}

function FolderGroup({
  folder,
  channels,
  unread,
  selectedChannelId,
  isCollapsed,
  onToggle,
  onDelete,
  folders,
  onMoveTo,
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

interface DraggableChannelProps {
  channel: ChannelData;
  isSelected: boolean;
  folders: FolderData[];
  onMoveTo: (channelId: string, folderId: string | null) => void;
}

function DraggableChannelLink({ channel, isSelected, folders, onMoveTo }: DraggableChannelProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: channel.id,
  });

  // setNodeRef + listeners go on the Link only (not the wrapping li), so the
  // Move-to dropdown button is a sibling outside the draggable zone. This
  // means clicking the dropdown never accidentally starts a drag, and we
  // don't need stopPropagation hacks on the button.
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
              aria-label="Move channel to folder"
              title="Move to…"
            >
              <FolderInput className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
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
            {folders.length > 0 && <DropdownMenuSeparator />}
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
