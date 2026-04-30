import { getWritable } from 'workflow';

/**
 * Emit a workflow's terminal stream event (typically `{type:'done'}`
 * or `{error}`) and close the underlying server stream — both on the
 * same writer.
 *
 * Each `getWritable()` call instantiates a fresh local
 * `WritableStream` wired to the same Redis-backed server stream via
 * its own `flushablePipe`. Writing the event on one writer, releasing
 * the lock, and then closing a *second* `getWritable()` instance
 * races straight to `world.closeStream(name, runId)` and can land
 * before the first writable's batcher has flushed (the
 * server-writable buffers chunks behind a ~10 ms `setTimeout`). When
 * the close wins the race the terminal event never reaches the
 * readable side, so `run.readable` ends without it, the client's
 * stream loop exits with `sawDone === false`, and the reader falls
 * into the "Generation ended unexpectedly. Please refresh in a
 * moment, or try again." branch even though the workflow finished
 * and persisted the row.
 *
 * Writing AND closing through the same writer makes `writer.close()`
 * propagate through the transform → `flushablePipe` →
 * server-writable chain so the close awaits the flush of the event
 * we just queued before the redis stream is shut.
 */
export async function emitTerminalEvent<T>(event: T): Promise<void> {
  const writable = getWritable<T>();
  const writer = writable.getWriter();
  await writer.write(event);
  await writer.close();
}
