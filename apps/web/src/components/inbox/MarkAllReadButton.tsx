'use client';

import { CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function MarkAllReadButton({
  body,
  scopeName,
  disabled = false,
}: {
  body: Record<string, unknown>;
  scopeName: string;
  disabled?: boolean;
}) {
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const scope =
    body.channelId != null
      ? `the channel “${scopeName}”`
      : body.playlistId != null
        ? `the playlist “${scopeName}”`
        : body.standaloneOnly === true
          ? 'your standalone library'
          : body.library === true
            ? 'your library'
            : 'all your subscribed channels';

  async function handleConfirm() {
    if (marking || disabled) {
      return;
    }
    setMarking(true);
    try {
      const res = await fetch('/api/videos/mark-all-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error('Failed to mark all as read. Please try again.');
      }
      await mutate(
        (key) =>
          typeof key === 'string' &&
          (key === '/api/channels' || key === '/api/playlists' || key.startsWith('/api/videos'))
      );
      router.refresh();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark all as read');
    } finally {
      setMarking(false);
    }
  }

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={disabled || marking}
                className="inline-flex shrink-0 items-center rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent"
                aria-label="Mark all as read"
              >
                <CheckCheck className="h-4 w-4" />
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {disabled ? 'Mark all as read. Nothing unread.' : 'Mark all as read'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AlertDialog
        open={open}
        onOpenChange={(value) => {
          if (!marking) {
            setOpen(value);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark all as read?</AlertDialogTitle>
            <AlertDialogDescription>
              All videos in {scope} will be marked as read, including videos on other pages and
              outside your current filters. They will disappear from unread views. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={marking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={marking || disabled}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirm();
              }}
            >
              {marking ? 'Marking…' : 'Mark all as read'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
