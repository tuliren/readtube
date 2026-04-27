'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

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
import type { ChannelData } from '@/lib/types';
import { channelHref } from '@/lib/urls/channelHref';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onChannelAdded: (channel: ChannelData) => void;
  /** When set, the newly subscribed channel is moved into this folder
   *  before `onChannelAdded` fires. Used by the folder dropdown's "Add
   *  channel" entry so a user can subscribe straight into a folder
   *  without an extra drag-and-drop step. */
  targetFolderId?: string | null;
}

/**
 * Modal for subscribing to a new channel (YouTube or Bilibili). Ported
 * from Headless UI Dialog to shadcn Dialog so every dialog in /inbox
 * uses the same primitive (NewFolderDialog, AddChannelModal, plus the
 * AlertDialog variants for destructive confirms). Visual contract
 * identical to the folder-create dialog: Title + Description in
 * DialogHeader, body with Input + helper copy, DialogFooter with
 * Cancel + Action buttons.
 */
export default function AddChannelModal({
  isOpen,
  onClose,
  onChannelAdded,
  targetFolderId = null,
}: Props) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function reset() {
    setUrl('');
    setError('');
    setLoading(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) {
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.status === 201) {
        const channel = (await res.json()) as ChannelData;
        // Best-effort folder assignment when the modal was opened from
        // a folder's "Add channel" entry. A failure here is logged but
        // not surfaced to the user — the channel is already
        // subscribed, and the user can still drag it into a folder
        // afterward.
        if (targetFolderId != null) {
          try {
            await fetch(`/api/subscriptions/${channel.id}/folder`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ folderId: targetFolderId }),
            });
            channel.folderId = targetFolderId;
          } catch (moveErr) {
            console.error('[AddChannelModal] move into folder failed', moveErr);
          }
        }
        onChannelAdded(channel);
        reset();
        onClose();
        router.push(channelHref(channel));
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  // Block close while a request is in flight so the user can't lose the
  // pending state by clicking the backdrop or hitting Escape mid-request.
  function handleOpenChange(open: boolean) {
    if (open) {
      return;
    }
    if (loading) {
      return;
    }
    reset();
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add channel</DialogTitle>
          <DialogDescription>Paste a channel URL from YouTube or Bilibili.</DialogDescription>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span aria-hidden>•</span>
              <code className="rounded bg-muted px-1">youtube.com/@handle</code>
            </li>
            <li className="flex gap-2">
              <span aria-hidden>•</span>
              <code className="rounded bg-muted px-1">youtube.com/channel/UCxxxxx</code>
            </li>
            <li className="flex gap-2">
              <span aria-hidden>•</span>
              <code className="rounded bg-muted px-1">space.bilibili.com/&lt;mid&gt;</code>
            </li>
          </ul>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="channel-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Channel URL"
            disabled={loading}
            autoFocus
          />

          {error.length > 0 && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || url.trim().length === 0}>
              {loading ? 'Adding…' : 'Add channel'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
