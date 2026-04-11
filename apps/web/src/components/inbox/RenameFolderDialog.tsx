'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { useFolders } from './useFolders';

interface Props {
  /** The folder to rename, or null when no rename dialog is active.
   *  Mirrors the controlled-target pattern used by DeleteFolderDialog —
   *  FolderSection holds the pending target in a single useState slot
   *  and passes null to dismiss. */
  target: { id: string; name: string } | null;
  onClose: () => void;
}

/**
 * shadcn Dialog for renaming a folder. Mirrors NewFolderDialog —
 * controlled by FolderSection, owns its own input + busy state, defers
 * the mutation and SWR invalidation to useFolders().rename().
 *
 * The input is pre-populated with the current name (and reset whenever
 * a new target opens) so the common case — fixing a typo — is one
 * click + a few keystrokes away. Submitting the unchanged name is
 * treated as a no-op close so the user isn't punished for opening the
 * dialog by mistake.
 */
export default function RenameFolderDialog({ target, onClose }: Props) {
  const { rename } = useFolders();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  // Re-seed the input every time the dialog opens against a new
  // target. Without this the field would still hold the previous
  // folder's name when the user opens rename on a different folder.
  useEffect(() => {
    if (target != null) {
      setName(target.name);
      setBusy(false);
    }
  }, [target]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (target == null || busy) {
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return;
    }
    if (trimmed === target.name) {
      // Nothing to do — close without firing a PATCH.
      onClose();
      return;
    }
    setBusy(true);
    await rename(target.id, trimmed);
    setBusy(false);
    onClose();
  }

  function handleOpenChange(open: boolean) {
    if (!open && !busy) {
      onClose();
    }
  }

  return (
    <Dialog open={target != null} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename folder</DialogTitle>
          <DialogDescription>Pick a new name for this folder.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Folder name"
            maxLength={80}
            disabled={busy}
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || name.trim().length === 0}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
