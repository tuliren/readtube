'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

/**
 * Dialog for adding a YouTube playlist by URL. Hits POST /api/playlists
 * which fetches the playlist RSS feed, creates a Playlist row with
 * the title from the feed, and ingests each video.
 */
export default function NewPlaylistDialog({ open, onOpenChange, onCreated }: Props) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { mutate } = useSWRConfig();
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setUrl('');
      setBusy(false);
      setError('');
    }
  }, [open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          playlistId: string;
          playlistName: string;
          videosProcessed: number;
        };
        toast.success(`Added "${data.playlistName}" with ${data.videosProcessed} videos`);
        onCreated();
        void mutate(
          (key) =>
            typeof key === 'string' && (key.startsWith('/api/videos') || key === '/api/playlists')
        );
        onOpenChange(false);
        router.push(`/videos/playlists/${data.playlistId}`);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Failed to add playlist.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && busy) {
      return;
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add playlist</DialogTitle>
          <DialogDescription>
            Paste a YouTube playlist URL:{' '}
            <code className="rounded bg-gray-100 px-1">youtube.com/playlist?list=PL…</code>,{' '}
            <code className="rounded bg-gray-100 px-1">youtube.com/watch?v=…&list=PL…</code>, or a
            bare playlist ID.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <Input
            autoFocus
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/playlist?list=PL…"
            disabled={busy}
          />

          {error.length > 0 && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || url.trim().length === 0}>
              {busy ? 'Adding…' : 'Add playlist'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
