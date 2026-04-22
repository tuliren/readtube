'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useSWRConfig } from 'swr';

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
  channelName: string;
  channelUrl: string;
}

export default function FollowChannelDialogButton({ channelName, channelUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutate } = useSWRConfig();

  if (followed) {
    return null;
  }

  async function handleConfirm() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: channelUrl }),
      });
      // 201 = newly subscribed; 409 = already subscribed (treat as
      // success so the plus icon disappears rather than nagging the
      // user with an inconsistency).
      if (res.status === 201 || res.status === 409) {
        setFollowed(true);
        setOpen(false);
        // Refresh the sidebar's subscribed-channels list so the newly
        // followed channel shows up without a page reload.
        void mutate('/api/channels');
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Something went wrong. Please try again.');
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        title={`Follow ${channelName}`}
        aria-label={`Follow ${channelName}`}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && busy) {
            return;
          }
          setOpen(next);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Follow this channel?</AlertDialogTitle>
            <AlertDialogDescription>
              Add <strong className="font-medium text-gray-900">{channelName}</strong> to your
              subscriptions. New videos from this channel will show up in your inbox.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error != null && <p className="text-sm text-red-600">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
              disabled={busy}
            >
              {busy ? 'Adding…' : 'Follow channel'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
