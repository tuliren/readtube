import { consumeNdjsonStream } from '@/lib/reader/consumeNdjsonStream';

function streamFromChunks(chunks: ReadonlyArray<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe('consumeNdjsonStream', () => {
  it('parses one event per newline-terminated line', async () => {
    const events: unknown[] = [];
    await consumeNdjsonStream(
      streamFromChunks([
        '{"field":"headline","delta":"Hello"}\n',
        '{"field":"short","delta":"World"}\n',
        '{"type":"done"}\n',
      ]),
      (e) => events.push(e)
    );
    expect(events).toEqual([
      { field: 'headline', delta: 'Hello' },
      { field: 'short', delta: 'World' },
      { type: 'done' },
    ]);
  });

  it('reassembles events split across chunk boundaries', async () => {
    // Simulates the network delivering deltas in arbitrary chunk
    // sizes. The buffer-and-split logic has to hold partial lines
    // across reads or the parser drops them.
    const events: unknown[] = [];
    await consumeNdjsonStream(
      streamFromChunks(['{"field":"head', 'line","delta":"H', 'i"}\n{"type":"do', 'ne"}\n']),
      (e) => events.push(e)
    );
    expect(events).toEqual([{ field: 'headline', delta: 'Hi' }, { type: 'done' }]);
  });

  it('flushes a trailing line that ran to end-of-stream without a newline', async () => {
    // The server's encoders always append `\n`, but cached-row
    // replays can land without one if the encoder ever changes.
    const events: unknown[] = [];
    await consumeNdjsonStream(streamFromChunks(['{"type":"done"}']), (e) => events.push(e));
    expect(events).toEqual([{ type: 'done' }]);
  });

  it('skips blank lines and malformed JSON without aborting the stream', async () => {
    const events: unknown[] = [];
    await consumeNdjsonStream(
      streamFromChunks([
        '\n',
        'not-json\n',
        '{"field":"headline","delta":"Hi"}\n',
        '   \n',
        '{broken\n',
        '{"type":"done"}\n',
      ]),
      (e) => events.push(e)
    );
    expect(events).toEqual([{ field: 'headline', delta: 'Hi' }, { type: 'done' }]);
  });

  it('handles multi-byte UTF-8 split mid-codepoint across chunks', async () => {
    // The full event is `{"delta":"日本語"}` — UTF-8 byte sequence
    // spans the chunk boundary so the decoder has to use streaming
    // mode (rather than decode-per-chunk) to avoid replacement
    // characters showing up in the parsed JSON.
    const encoder = new TextEncoder();
    const full = encoder.encode('{"delta":"日本語"}\n');
    const split = full.length / 2;
    const chunkA = full.slice(0, split);
    const chunkB = full.slice(split);
    const events: unknown[] = [];
    await consumeNdjsonStream(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunkA);
          controller.enqueue(chunkB);
          controller.close();
        },
      }),
      (e) => events.push(e)
    );
    expect(events).toEqual([{ delta: '日本語' }]);
  });
});
