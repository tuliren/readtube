'use client';

import { CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

export default function MarkAllReadMenuItem({
  scope,
  unreadCount,
}: {
  scope: { channelId: string } | { folderId: string };
  unreadCount: number;
}) {
  const { mutate } = useSWRConfig();
  const [marking, setMarking] = useState(false);

  async function handleMarkAllRead() {
    if (marking) {
      return;
    }
    setMarking(true);
    try {
      const res = await fetch('/api/videos/mark-all-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scope),
      });
      if (!res.ok) {
        throw new Error('Failed to mark as read');
      }
      await mutate(
        (key) =>
          typeof key === 'string' &&
          (key === '/api/channels' || key === '/api/playlists' || key.startsWith('/api/videos'))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark as read');
    } finally {
      setMarking(false);
    }
  }

  return (
    <DropdownMenuItem
      disabled={marking || unreadCount === 0}
      onSelect={() => void handleMarkAllRead()}
    >
      <CheckCheck className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
      {marking ? 'Marking…' : 'Mark all as read'}
    </DropdownMenuItem>
  );
}
