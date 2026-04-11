'use client';

import { useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { useFolders } from './useFolders';

interface Props {
  /** The folder being deleted. Null hides the dialog. */
  target: { id: string; name: string } | null;
  onClose: () => void;
}

/**
 * shadcn AlertDialog for destructive folder deletion. Replaces the
 * window.confirm call that FolderSection used to make. AlertDialog (not
 * Dialog) is the right primitive: it grabs focus, traps it, handles
 * Escape semantics, and flags the action as destructive via the action
 * button styling.
 *
 * Folder deletion is non-destructive for the contained channels —
 * Prisma's SetNull FK on UserSubscription.folder_id drops them back to
 * the root Inbox bucket automatically.
 */
export default function DeleteFolderDialog({ target, onClose }: Props) {
  const { remove } = useFolders();
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    if (target == null || busy) {
      return;
    }
    setBusy(true);
    await remove(target.id);
    setBusy(false);
    onClose();
  }

  return (
    <AlertDialog
      open={target != null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete folder?</AlertDialogTitle>
          <AlertDialogDescription>
            {target != null ? (
              <>
                <strong className="font-medium text-gray-900">{target.name}</strong>
                {' will be removed from the sidebar. Channels inside it will move back '}
                to the root Inbox — they won&rsquo;t be unsubscribed.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // AlertDialogAction auto-closes on click; we want to stay open
              // while the delete is in-flight, then explicitly close on
              // success. Prevent the default close so `busy` state can show.
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={busy}
            className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
          >
            {busy ? 'Deleting…' : 'Delete folder'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
