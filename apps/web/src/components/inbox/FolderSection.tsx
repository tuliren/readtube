'use client';

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { ChevronDown, ChevronRight, FolderPlus, Plus, Radio } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useCollapseState } from '@/components/dashboard/CollapseStateContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { displayChannelName } from '@/lib/inbox/channelName';
import type { ChannelData } from '@/lib/types';
import { channelHref } from '@/lib/urls/channelHref';

import ChannelAvatar from './ChannelAvatar';
import DeleteFolderDialog from './DeleteFolderDialog';
import DraggableChannelLink from './DraggableChannelLink';
import FolderGroup from './FolderGroup';
import NewFolderDialog from './NewFolderDialog';
import RemoveChannelDialog from './RemoveChannelDialog';
import RenameFolderDialog from './RenameFolderDialog';
import { useSidebar } from './SidebarContext';
import { useFolders } from './useFolders';

interface Props {
  channels: ChannelData[];
  selectedChannelId: string | null;
  /** Opens the AddChannelModal owned by DashboardShell. Lives here
   *  (rather than in ChannelSection) so the entry point sits right
   *  under the Channels category header — next to the thing it adds
   *  to. The optional folderId pre-selects a destination folder when
   *  the menu is invoked from a per-folder dropdown. */
  onAddChannel: (folderId?: string | null) => void;
}

/**
 * Folder-aware channel list. Channels are grouped under their folder_id;
 * any channel without a folder_id shows up in the "Inbox" (root) group at
 * the top. Drag a channel row onto a folder to move it; drop on "Inbox"
 * to unassign. Alternatively, use the per-row Move-to dropdown.
 *
 * Collapsible folders + per-folder unread rollups are local-state only —
 * expand state isn't persisted across reloads yet.
 */
export default function FolderSection({ channels, selectedChannelId, onAddChannel }: Props) {
  const { collapsed: sidebarCollapsed } = useSidebar();
  const { folders, moveChannel } = useFolders();
  const { channelsCollapsed, toggleChannels, isFolderCollapsed, toggleFolder } = useCollapseState();
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [pendingRename, setPendingRename] = useState<{ id: string; name: string } | null>(null);
  const [pendingRemoveChannel, setPendingRemoveChannel] = useState<{
    id: string;
    name: string;
  } | null>(null);

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

  // Collapsed mode: show channel avatars (or initials) with tooltips, no
  // drag-drop or folder structure. A simple "+ Add" button at the top.
  if (sidebarCollapsed) {
    return (
      <div className="mt-4 flex flex-col items-center gap-1 px-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onAddChannel(null)}
              className="flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Add channel"
            >
              <Plus className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Add channel</TooltipContent>
        </Tooltip>
        <div className="my-1 h-px w-6 bg-border" />
        {channels.map((channel) => {
          const active = selectedChannelId === channel.id;
          return (
            <Tooltip key={channel.id}>
              <TooltipTrigger asChild>
                <Link
                  href={channelHref(channel)}
                  className={`flex items-center justify-center rounded-md p-1.5 ${
                    active
                      ? 'bg-blue-50 ring-2 ring-blue-200 dark:bg-blue-500/15 dark:ring-blue-500/30'
                      : 'hover:bg-accent'
                  }`}
                >
                  {channel.logoUrl != null ? (
                    <ChannelAvatar url={channel.logoUrl} size={40} cssSize="h-6 w-6" />
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                      {channel.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">
                {channel.name}
                {channel.unreadCount > 0 ? ` (${channel.unreadCount})` : ''}
              </TooltipContent>
            </Tooltip>
          );
        })}
        <RemoveChannelDialog
          target={pendingRemoveChannel}
          currentChannelId={selectedChannelId}
          onClose={() => setPendingRemoveChannel(null)}
        />
      </div>
    );
  }

  return (
    <DndContext
      // Stable id prevents a hydration mismatch on the
      // aria-describedby="DndDescribedBy-N" attributes that dnd-kit
      // attaches to every draggable. Without this, dnd-kit falls
      // back to a module-level auto-increment counter — and React
      // strict mode's dev-only double-render bumps the client
      // counter ahead of the SSR counter, so the server emits
      // "DndDescribedBy-0" while the client emits
      // "DndDescribedBy-2", tripping React's hydration check on
      // pages that share this layout (e.g. /inbox/ask).
      id="inbox-channels-dnd"
      sensors={sensors}
      // pointerWithin (instead of the default rectIntersection) so the
      // drop target tracks the cursor, not the dragged overlay rect.
      // With rectIntersection, dragging a channel toward the first
      // folder would still intersect the RootDropZone above it (only an
      // `mt-2` margin separates their bounding boxes) and `over` would
      // resolve to 'root' — silently re-routing the drop to "unassign"
      // instead of "move into first folder". pointerWithin ignores the
      // overlay's geometry and just asks "what's under the cursor?",
      // which matches user intent for a vertical sidebar list.
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/*
        Section header — matches the Views header typography in
        ViewsSection.tsx (text-base font-semibold text-gray-900) so the
        two category labels are the largest, darkest text in the sidebar.
        Trailing "+" button opens a dropdown with the two creation
        actions (Add channel / Create folder), aligned to the same
        right rail as the per-row ⋯ menus on channels and folders.
      */}
      <div className="mb-1 mt-4 flex items-center justify-between px-3">
        <button
          type="button"
          onClick={toggleChannels}
          className="flex flex-1 items-center gap-1 pl-2 text-left"
          aria-expanded={!channelsCollapsed}
          aria-label={channelsCollapsed ? 'Expand channels' : 'Collapse channels'}
        >
          {channelsCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="text-base font-semibold text-foreground">Channels</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
              aria-label="Add channel or folder"
              title="Add channel or folder"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => onAddChannel(null)}>
              <Radio className="mr-2 h-4 w-4 text-muted-foreground" />
              Add channel
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setNewFolderOpen(true)}>
              <FolderPlus className="mr-2 h-4 w-4 text-muted-foreground" />
              Create folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {channelsCollapsed ? null : (
        <>
          {/* Root (unfoldered) channels */}
          <RootDropZone>
            {rootChannels.length === 0 ? (
              <p className="px-3 py-1 text-xs text-muted-foreground">
                Drop channels here to move channels out of folders
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
                    onRemove={setPendingRemoveChannel}
                  />
                ))}
              </ul>
            )}
          </RootDropZone>

          {/* Folders */}
          {folders.map((folder) => {
            const folderChannels = byFolder.get(folder.id) ?? [];
            const folderUnread = folderChannels.reduce((sum, c) => sum + c.unreadCount, 0);
            const isCollapsed = isFolderCollapsed(folder.id);

            return (
              <FolderGroup
                key={folder.id}
                folder={folder}
                channels={folderChannels}
                unread={folderUnread}
                selectedChannelId={selectedChannelId}
                isCollapsed={isCollapsed}
                onToggle={() => toggleFolder(folder.id)}
                onRename={() => setPendingRename({ id: folder.id, name: folder.name })}
                onDelete={() => setPendingDelete({ id: folder.id, name: folder.name })}
                onAddChannel={() => onAddChannel(folder.id)}
                folders={folders}
                onMoveTo={moveTo}
                onRemoveChannel={setPendingRemoveChannel}
              />
            );
          })}
        </>
      )}

      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} />
      <RenameFolderDialog target={pendingRename} onClose={() => setPendingRename(null)} />
      <DeleteFolderDialog target={pendingDelete} onClose={() => setPendingDelete(null)} />
      <RemoveChannelDialog
        target={pendingRemoveChannel}
        currentChannelId={selectedChannelId}
        onClose={() => setPendingRemoveChannel(null)}
      />

      {/*
        Portal-rendered floating preview that follows the cursor during
        drag. Without this, the source row only fades via isDragging
        opacity but nothing actually moves with the pointer, which is
        why the raw useDraggable behavior looked broken/unintuitive.
      */}
      <DragOverlay dropAnimation={null}>
        {activeChannel != null ? (
          <div className="flex cursor-grabbing items-center justify-between gap-2 rounded-md border border-blue-300 bg-card px-3 py-1.5 text-sm font-medium text-blue-700 shadow-lg ring-2 ring-blue-200">
            <span className="truncate">{displayChannelName(activeChannel.name)}</span>
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

/**
 * Small inline drop target for the "unfoldered" root bucket. Left in
 * this file because it's trivially small (~8 lines) and lives alongside
 * the channel list it wraps; extracting it into its own file would be
 * more churn than value.
 */
function RootDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'root' });
  // The `px-3` here is the same outer padding ViewsSection uses
  // (`<div className="px-3 pt-4">`) and that the FolderGroup header
  // uses (`<div className="px-3">`) — without it, root channels would
  // sit at half the indent of views and folder headers because their
  // only horizontal padding would come from sidebarRowClass's own
  // px-3, while views/folders get px-3 + px-3.
  return (
    <div
      ref={setNodeRef}
      className={`mt-1 px-3 ${isOver ? 'bg-blue-50/60 dark:bg-blue-500/10' : ''}`}
    >
      {children}
    </div>
  );
}
