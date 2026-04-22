'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { mutate } from 'swr';

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

interface Props {
  /** The channel being removed. Null hides the dialog. */
  target: { id: string; name: string } | null;
  onClose: () => void;
}

/**
 * Confirmation dialog for removing a channel from the user's inbox.
 * This only deletes the user's subscription — the channel and its
 * videos remain in the database for other users.
 */
export default function RemoveChannelDialog({ target, onClose }: Props) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target != null) {
      setBusy(false);
    }
  }, [target]);

  async function handleConfirm() {
    if (target == null || busy) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/channels/${target.id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error(`Failed (${res.status})`);
      }
      void mutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/'), undefined, {
        revalidate: true,
      });
      toast.success(`Removed ${target.name}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove channel');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={target != null}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove channel?</AlertDialogTitle>
          <AlertDialogDescription>
            {target != null ? (
              <>
                <strong className="font-medium text-gray-900">{target.name}</strong>
                {
                  ' will be removed from your subscribed channels. All your data associated with this channel and its videos will be permanently deleted. You can re-add the channel at any time, but your data cannot be recovered.'
                }
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={busy}
            className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
          >
            {busy ? 'Removing…' : 'Remove channel'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
