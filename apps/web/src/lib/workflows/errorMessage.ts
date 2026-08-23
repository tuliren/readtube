/**
 * Extract a human-readable message from a workflow step failure.
 *
 * Step errors cross the workflow runtime's event-log boundary: the
 * runtime serializes the thrown error and replays it into the workflow
 * function, where the rehydrated value is not necessarily `instanceof
 * Error` (observed in production: every step failure surfaced as the
 * generic catch fallback because the prototype did not survive the
 * round-trip, hiding real causes like content-policy blocks). Read
 * `.message` structurally instead of trusting the prototype chain.
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'object' && err != null) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  if (typeof err === 'string' && err.length > 0) {
    return err;
  }
  return fallback;
}
