/**
 * Read an NDJSON response body line by line, parsing each line as JSON
 * and forwarding the parsed event to `handler`. Resolves when the
 * stream closes naturally; the caller is responsible for tracking
 * terminal events (`{type:'done'}` / `{error}`) inside `handler`.
 *
 * Used by SummaryReader and ArticleReader for both the POST-driven
 * generation stream and the GET-on-mount tap-in stream that lands when
 * the server detects an in-flight workflow (see `runRegistry` and
 * `streamResponse`). Both paths share the same wire format, so the
 * parsing loop is shared too.
 *
 * Non-JSON lines (e.g. transport keep-alives) are silently ignored —
 * the handler only sees real events.
 */
export async function consumeNdjsonStream(
  body: ReadableStream<Uint8Array>,
  handler: (event: unknown) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // The last element is the partial line after the final `\n`, or
    // empty string if the chunk ended on a newline. Save it for the
    // next iteration; only emit fully-terminated lines.
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }
      try {
        handler(JSON.parse(trimmed));
      } catch {
        // Tolerate non-JSON noise (keep-alive comments, etc.) so a
        // single malformed line doesn't take down the whole stream.
      }
    }
  }

  // Flush a trailing line that ran to end-of-stream without a final
  // newline. The server's encoders always append `\n`, but staying
  // permissive here keeps the consumer robust to alternative
  // encoders (e.g. cached-row replays).
  if (buffer.trim().length > 0) {
    try {
      handler(JSON.parse(buffer.trim()));
    } catch {
      // ignore
    }
  }
}
