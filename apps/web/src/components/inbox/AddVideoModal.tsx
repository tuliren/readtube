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
}

/**
 * Modal for adding an individual YouTube video to the user's library.
 * Hits POST /api/videos which resolves the owning channel and creates
 * a StandaloneVideo row; the backing Channel/Video rows are upserted
 * transparently.
 */
export default function AddVideoModal({ open, onOpenChange }: Props) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { mutate } = useSWRConfig();
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setUrl('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = (await res.json()) as { sourceId: string };
        toast.success('Video added');
        void mutate(
          (key) =>
            typeof key === 'string' && (key.startsWith('/api/videos') || key === '/api/playlists')
        );
        onOpenChange(false);
        router.push(`/videos/${encodeURIComponent(data.sourceId)}`);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Failed to add video.');
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
          <DialogTitle>Add video</DialogTitle>
          <DialogDescription>
            Paste a YouTube video URL or id:{' '}
            <code className="rounded bg-gray-100 px-1">youtube.com/watch?v=…</code>,{' '}
            <code className="rounded bg-gray-100 px-1">youtu.be/…</code>, or a bare 11-char id.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <Input
            autoFocus
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=…"
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
              {busy ? 'Adding…' : 'Add video'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
