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
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * shadcn Dialog for creating a folder. Replaces the window.prompt call
 * that FolderSection used to make — see the sidebar redesign section of
 * ~/.claude/plans/woolly-bouncing-wreath.md for the rationale.
 *
 * The dialog owns its own input state + submit/pending flags. On success
 * it resets the input and closes via onOpenChange; the actual mutation
 * and SWR invalidation are handled by useFolders().create().
 */
export default function NewFolderDialog({ open, onOpenChange }: Props) {
  const { create } = useFolders();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset state whenever the dialog reopens so stale input from a
  // previous aborted create doesn't leak across sessions.
  useEffect(() => {
    if (open) {
      setName('');
      setBusy(false);
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || busy) {
      return;
    }
    setBusy(true);
    const folder = await create(trimmed);
    setBusy(false);
    if (folder != null) {
      onOpenChange(false);
    }
    // If create returned null, useFolders already toasted an error and
    // we leave the dialog open so the user can retry.
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>
            Group channels together so you can collapse and see unread counts at a glance.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tech"
            maxLength={80}
            disabled={busy}
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || name.trim().length === 0}>
              {busy ? 'Creating…' : 'Create folder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
