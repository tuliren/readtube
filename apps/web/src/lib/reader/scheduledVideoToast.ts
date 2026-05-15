/**
 * Helpers that translate the server's `code: 'scheduled'` response
 * (HTTP 425) into a human-readable toast / inline message. Used by
 * the Transcript, Summary, and Article readers so they speak the
 * same language when a video is a scheduled premiere that hasn't
 * aired yet.
 *
 * Why 425 and not 410: we don't want the client to remember
 * "scheduled" as permanently unavailable — that's the whole point
 * of distinguishing the two. The transcript route, summary route,
 * and article route all return 425 with `code: 'scheduled'` and an
 * optional `scheduledStartTime` ISO string in the body.
 */
export interface ScheduledResponseBody {
  code?: string;
  scheduledStartTime?: string | null;
  error?: string;
}

/**
 * Try to parse a Response's body as the scheduled-video shape.
 * Returns null if the body is missing or doesn't carry the
 * `code: 'scheduled'` discriminator. Safe to call after observing
 * `res.status === 425` — the response body is consumed at most
 * once, just like the other reader branches.
 */
export async function parseScheduledResponse(res: Response): Promise<ScheduledResponseBody | null> {
  let body: ScheduledResponseBody | null = null;
  try {
    body = (await res.json()) as ScheduledResponseBody;
  } catch {
    return null;
  }
  if (body?.code !== 'scheduled') {
    return null;
  }
  return body;
}

/**
 * Compose the user-facing message for a scheduled-video response.
 * Includes the localized scheduled-start time when the server
 * supplied a parseable date; otherwise falls back to a generic
 * "hasn't aired yet" line.
 */
export function buildScheduledMessage(scheduledStartTime: string | null | undefined): string {
  if (scheduledStartTime != null && scheduledStartTime.length > 0) {
    const d = new Date(scheduledStartTime);
    if (!Number.isNaN(d.getTime())) {
      const formatted = d.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      return `This video is scheduled to air on ${formatted}. Try again once it has premiered.`;
    }
  }
  return 'This video has not aired yet. Try again once it has premiered.';
}
