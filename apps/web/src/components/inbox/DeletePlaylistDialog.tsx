'use client';

import { useRouter } from 'next/navigation';
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
  /** The playlist being deleted. Null hides the dialog. */
  target: { id: string; name: string } | null;
  onClose: () => void;
}

/**
 * Confirmation dialog for deleting a user's playlist. Removes the
 * Playlist row + its PlaylistVideo membership. The underlying Video
 * rows and the user's StandaloneVideo entries remain — only the
 * grouping goes away.
 */
export default function DeletePlaylistDialog({ target, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

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
      const res = await fetch(`/api/playlists/${target.id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error(`Failed (${res.status})`);
      }
      void mutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/'), undefined, {
        revalidate: true,
      });
      toast.success(`Deleted ${target.name}`);
      onClose();
      // If the user was viewing the deleted playlist, bounce them back
      // to the Standalone library so they don't see a 404.
      if (window.location.pathname.startsWith(`/videos/playlists/${target.id}`)) {
        router.push('/videos/standalone');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete playlist');
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
          <AlertDialogTitle>Delete playlist?</AlertDialogTitle>
          <AlertDialogDescription>
            {target != null ? (
              <>
                <strong className="font-medium text-gray-900">{target.name}</strong>
                {
                  ' will be deleted. The playlist itself and its grouping of videos will be removed, but the underlying videos stay in your library. This cannot be undone.'
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
            {busy ? 'Deleting…' : 'Delete playlist'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
