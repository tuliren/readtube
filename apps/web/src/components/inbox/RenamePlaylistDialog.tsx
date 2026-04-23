'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { mutate } from 'swr';

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

interface Props {
  /** The playlist being renamed. Null hides the dialog. */
  target: { id: string; name: string; customName: string | null } | null;
  onClose: () => void;
}

/**
 * Rename dialog for a user's playlist. Updates the `custom_name`
 * override on the Playlist row; the original source name is kept
 * unchanged. Clearing the input removes the override (falls back to
 * the original name).
 */
export default function RenamePlaylistDialog({ target, onClose }: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (target != null) {
      setValue(target.customName ?? '');
      setBusy(false);
      setError('');
    }
  }, [target]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (target == null || busy) {
      return;
    }
    const trimmed = value.trim();
    // Empty string clears the override.
    const payload = { customName: trimmed.length === 0 ? null : trimmed };
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/playlists/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Failed to rename playlist.');
        return;
      }
      toast.success('Playlist renamed');
      void mutate(
        (key: unknown) => typeof key === 'string' && key === '/api/playlists',
        undefined,
        { revalidate: true }
      );
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={target != null}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename playlist</DialogTitle>
          <DialogDescription>
            Change the display name. The original playlist title (
            <span className="font-medium text-foreground">{target?.name ?? ''}</span>) stays
            unchanged and is shown in parentheses. Leave blank to clear the custom name.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={target?.name ?? 'Custom name'}
            maxLength={80}
            disabled={busy}
          />

          {error.length > 0 && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
