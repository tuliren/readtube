'use client';

import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

import type { BulkAction } from '@/lib/inbox/triageActions';

/**
 * Drain an NDJSON stream that emits either `{ error }` or
 * `{ type: 'done' }` as its terminal event (plus whatever domain
 * events come before). Resolves when the stream closes cleanly with
 * a `done` event and no intervening error. Throws the first error
 * message if the server reports one mid-stream, or a generic message
 * if the stream ends without signaling completion.
 *
 * This matters because the generate streams open with HTTP 200 as
 * soon as the first chunk is produced — LLM / persist failures are
 * reported inside the body, not via status. A plain byte-drain would
 * happily return `true` on a failed generation and leave the UI
 * with a stuck spinner.
 */
async function drainNdjsonStream(response: Response): Promise<void> {
  const reader = response.body?.getReader();
  if (reader == null) {
    return;
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let errorMessage: string | null = null;
  let sawDone = false;

  const consumeLine = (line: string) => {
    if (line.length === 0) {
      return;
    }
    let event: { error?: unknown; type?: unknown };
    try {
      event = JSON.parse(line);
    } catch {
      return; // tolerate non-JSON keep-alive lines
    }
    if (event.error != null && errorMessage == null) {
      errorMessage = typeof event.error === 'string' ? event.error : String(event.error);
    }
    if (event.type === 'done') {
      sawDone = true;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      consumeLine(line);
    }
  }
  // Flush any trailing partial line that ran to end-of-stream without
  // a newline terminator.
  if (buffer.length > 0) {
    consumeLine(buffer);
  }

  if (errorMessage != null) {
    throw new Error(errorMessage);
  }
  if (!sawDone) {
    throw new Error('Stream closed before completion');
  }
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

    async markRead(videoId: string): Promise<boolean> {
      try {
        await call('POST', `/api/videos/${videoId}/read`);
        invalidateLists();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to mark as read');
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
        // Drain the NDJSON stream until the server signals completion.
        // The helper throws on any `{ error }` event so a mid-stream
        // LLM or persist failure surfaces as a toast + returns false
        // (instead of silently returning true and leaving the caller
        // with a stuck pending flag).
        await drainNdjsonStream(res);
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to generate summary');
        return false;
      } finally {
        // Refresh regardless of outcome: the server may have mutated
        // video state even when generation fails (e.g. setting the
        // sticky transcript_unavailable flag on 410), and the row
        // badges need to reflect that.
        invalidateLists();
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
        await drainNdjsonStream(res);
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to generate article');
        return false;
      } finally {
        invalidateLists();
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
