'use client';

import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

import type { BulkAction } from '@/lib/inbox/triageActions';

/**
 * True for the library list routes whose video data is server-rendered
 * without a SWR fallback: /videos, /videos/standalone, and
 * /videos/playlists/[id]. Excludes the reader (/videos/[sourceId])
 * which renders a single video and doesn't need a list refresh.
 */
function isLibraryListRoute(pathname: string | null): boolean {
  if (pathname == null) {
    return false;
  }
  return (
    pathname === '/videos' ||
    pathname === '/videos/standalone' ||
    pathname.startsWith('/videos/playlists/')
  );
}

/**
 * Small client-side hook that hides fetch + SWR invalidation behind
 * single-function calls for each triage action. Every mutation invalidates
 * BOTH /api/videos and /api/channels so unread counts stay in sync with
 * row state (star doesn't need the channel refresh, but the cost is
 * trivial and the consistency is worth it).
 *
 * Return contract: each toggle returns `true` on success, `false` on
 * failure. Callers that track optimistic state (e.g. VideoReaderActions,
 * which flips icons before the fetch resolves) use the boolean to decide
 * whether to revert. Errors are toasted inside this hook so every call
 * site shares the same error surface.
 */
export function useTriage() {
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const pathname = usePathname();

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
    // predicate that matches any /api/videos URL. /api/playlists is
    // included because playlist video counts (displayed in the sidebar)
    // shift when library membership changes.
    //
    // Call mutate with just the key — passing `undefined` as the data arg
    // clears the cache during revalidation, which causes the hook to fall
    // back to its SSR `fallbackData` (captured at page load, so the list
    // reflects pre-mutation state) until the fetch resolves. For a plain
    // revalidation we want SWR to hold the current cache and swap in the
    // fresh payload when it arrives.
    void mutate(
      (key) =>
        typeof key === 'string' && (key.startsWith('/api/videos') || key === '/api/playlists')
    );
    void mutate('/api/channels');
    // Library pages (/videos, /videos/standalone, /videos/playlists/[id])
    // are server-rendered — their video list comes from a loader at page
    // load time, not SWR. router.refresh() re-runs the RSC so the list
    // updates without a full page reload. Skip on the inbox/channel
    // routes where SWR revalidation alone suffices, to avoid an extra
    // RSC round-trip per rapid triage action.
    if (isLibraryListRoute(pathname)) {
      router.refresh();
    }
  }

  return {
    async toggleStar(videoId: string, isStarred: boolean): Promise<boolean> {
      try {
        await call(isStarred ? 'DELETE' : 'POST', `/api/videos/${videoId}/star`);
        invalidateLists();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to star video');
        return false;
      }
    },

    async toggleSave(videoId: string, isSaved: boolean): Promise<boolean> {
      try {
        await call(isSaved ? 'DELETE' : 'POST', `/api/videos/${videoId}/save`);
        invalidateLists();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save video');
        return false;
      }
    },

    async archive(videoId: string): Promise<boolean> {
      try {
        await call('POST', `/api/videos/${videoId}/archive`);
        invalidateLists();
        toast.success('Archived');
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to archive');
        return false;
      }
    },

    async unarchive(videoId: string): Promise<boolean> {
      try {
        await call('DELETE', `/api/videos/${videoId}/archive`);
        invalidateLists();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to unarchive');
        return false;
      }
    },

    async addToPlaylist(videoId: string, playlistId: string): Promise<boolean> {
      try {
        await call('POST', `/api/playlists/${playlistId}/videos`, { videoId });
        invalidateLists();
        toast.success('Added to playlist');
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add to playlist');
        return false;
      }
    },

    async removeFromPlaylist(videoId: string, playlistId: string): Promise<boolean> {
      try {
        await call('DELETE', `/api/playlists/${playlistId}/videos?videoId=${videoId}`);
        invalidateLists();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to remove from playlist');
        return false;
      }
    },

    async generateSummary(videoId: string): Promise<boolean> {
      try {
        const res = await fetch(`/api/videos/${videoId}/summary`, { method: 'POST' });
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
        // Drain the NDJSON stream so the server can finish persisting
        // before we invalidate. Without this the /api/videos refetch
        // races the upsert and the artifact badge still reads false.
        const reader = res.body?.getReader();
        if (reader != null) {
          while (true) {
            const { done } = await reader.read();
            if (done) {
              break;
            }
          }
        }
        invalidateLists();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to generate summary');
        return false;
      }
    },

    async generateArticle(videoId: string): Promise<boolean> {
      try {
        const res = await fetch(`/api/videos/${videoId}/article`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
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
        const reader = res.body?.getReader();
        if (reader != null) {
          while (true) {
            const { done } = await reader.read();
            if (done) {
              break;
            }
          }
        }
        invalidateLists();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to generate article');
        return false;
      }
    },

    async removeFromLibrary(videoId: string): Promise<boolean> {
      try {
        await call('DELETE', `/api/videos/${videoId}/standalone`);
        invalidateLists();
        toast.success('Removed from library');
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to remove from library');
        return false;
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
