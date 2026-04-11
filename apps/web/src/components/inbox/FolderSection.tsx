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
import { FolderPlus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { displayChannelName } from '@/lib/inbox/channelName';
import type { ChannelData } from '@/lib/types';

import DeleteFolderDialog from './DeleteFolderDialog';
import DraggableChannelLink from './DraggableChannelLink';
import FolderGroup from './FolderGroup';
import NewFolderDialog from './NewFolderDialog';
import RenameFolderDialog from './RenameFolderDialog';
import { SidebarRowContent, sidebarRowClass } from './SidebarRow';
import { useFolders } from './useFolders';

interface Props {
  channels: ChannelData[];
  selectedChannelId: string | null;
  /** Opens the AddChannelModal owned by InboxShell. Lives here (rather
   *  than in ChannelSection) so the entry point sits right under the
   *  Channels category header — next to the thing it adds to. */
  onAddChannel: () => void;
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
  const { folders, moveChannel } = useFolders();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [pendingRename, setPendingRename] = useState<{ id: string; name: string } | null>(null);

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
        Outer wrapper uses px-3 so the New-folder action button aligns
        on the same right rail (12px) as every channel/folder row in the
        section; the label compensates with its own px-2 to keep the
        20px left visual indent that matches the Views header.
      */}
      <div className="mb-1 mt-4 flex items-center justify-between px-3">
        <p className="px-2 text-base font-semibold text-gray-900">Channels</p>
        <button
          type="button"
          onClick={() => setNewFolderOpen(true)}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="New folder"
          aria-label="New folder"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/*
        + Add channel — sits right under the Channels header so the
        entry point is next to the thing it adds to. Same row primitive
        (sidebarRowClass + SidebarRowContent) as a root channel link so
        padding, hover, and typography line up exactly. The "+" lives in
        the label string rather than as a leading icon because channel
        rows themselves no longer carry an icon — keeping the structure
        identical means the action reads as "another row" instead of
        breaking the rail with a different shape.
      */}
      <div className="px-3">
        <button
          type="button"
          onClick={onAddChannel}
          className={`${sidebarRowClass(false)} w-full text-left`}
        >
          <SidebarRowContent label="+ Add channel" />
        </button>
      </div>

      {/* Root (unfoldered) channels */}
      <RootDropZone>
        {rootChannels.length === 0 ? (
          <p className="px-3 py-1 text-xs text-gray-300">
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
            onRename={() => setPendingRename({ id: folder.id, name: folder.name })}
            onDelete={() => setPendingDelete({ id: folder.id, name: folder.name })}
            folders={folders}
            onMoveTo={moveTo}
          />
        );
      })}

      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} />
      <RenameFolderDialog target={pendingRename} onClose={() => setPendingRename(null)} />
      <DeleteFolderDialog target={pendingDelete} onClose={() => setPendingDelete(null)} />

      {/*
        Portal-rendered floating preview that follows the cursor during
        drag. Without this, the source row only fades via isDragging
        opacity but nothing actually moves with the pointer, which is
        why the raw useDraggable behavior looked broken/unintuitive.
      */}
      <DragOverlay dropAnimation={null}>
        {activeChannel != null ? (
          <div className="flex cursor-grabbing items-center justify-between gap-2 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 shadow-lg ring-2 ring-blue-200">
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
    <div ref={setNodeRef} className={`mt-1 px-3 ${isOver ? 'bg-blue-50/60' : ''}`}>
      {children}
    </div>
  );
}
