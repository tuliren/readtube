'use client';

import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

import type { BulkAction } from '@/lib/inbox/triageActions';

/**
 * Small client-side hook that hides fetch + SWR invalidation behind
 * single-function calls for each triage action. Every mutation invalidates
 * BOTH /api/videos and /api/channels so unread counts stay in sync with
 * row state (star doesn't need the channel refresh, but the cost is
 * trivial and the consistency is worth it).
 */
export function useTriage() {
  const { mutate } = useSWRConfig();

  async function call(method: 'POST' | 'DELETE', url: string, body?: unknown): Promise<Response> {
    const res = await fetch(url, {
      method,
      headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        const json = await res.json();
        if (json?.error != null) {
          msg = String(json.error);
        }
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    return res;
  }

  function invalidateLists() {
    // SWR's mutate matches the fetcher key; since /api/videos is used both
    // with and without a channelId query string, we invalidate via a
    // predicate that matches any /api/videos URL.
    void mutate((key) => typeof key === 'string' && key.startsWith('/api/videos'), undefined, {
      revalidate: true,
    });
    void mutate('/api/channels', undefined, { revalidate: true });
  }

  return {
    async toggleStar(videoId: string, isStarred: boolean): Promise<void> {
      try {
        await call(isStarred ? 'DELETE' : 'POST', `/api/videos/${videoId}/star`);
        invalidateLists();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to star video');
      }
    },

    async toggleSave(videoId: string, isSaved: boolean): Promise<void> {
      try {
        await call(isSaved ? 'DELETE' : 'POST', `/api/videos/${videoId}/save`);
        invalidateLists();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save video');
      }
    },

    async archive(videoId: string): Promise<void> {
      try {
        await call('POST', `/api/videos/${videoId}/archive`);
        invalidateLists();
        toast.success('Archived');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to archive');
      }
    },

    async unarchive(videoId: string): Promise<void> {
      try {
        await call('DELETE', `/api/videos/${videoId}/archive`);
        invalidateLists();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to unarchive');
      }
    },

    async snoozeUntil(videoId: string, until: Date): Promise<void> {
      try {
        await call('POST', `/api/videos/${videoId}/snooze`, {
          snoozeUntil: until.toISOString(),
        });
        invalidateLists();
        toast.success(`Snoozed until ${until.toLocaleDateString()}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to snooze');
      }
    },

    async bulk(videoIds: string[], action: BulkAction): Promise<number> {
      try {
        const res = await call('POST', '/api/videos/bulk', { videoIds, action });
        const body = (await res.json()) as { affected: number };
        invalidateLists();
        return body.affected;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Bulk action failed');
        return 0;
      }
    },
  };
}
