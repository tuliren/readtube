/**
 * Some LLMs in JSON-mode structured output emit literal escape
 * sequences (`\n`, `\r`, `\t`) as backslash-letter pairs in the
 * decoded string, instead of the actual whitespace control character.
 * The model produced JSON source like `"line1\\nline2"` instead of
 * `"line1\nline2"`, so after the SDK's JSON.parse the field value is
 * two characters `\` + `n` rather than one newline. The markdown
 * renderer then displays the escape sequence verbatim.
 *
 * This is most visible on Chinese / CJK summaries where the model
 * writes `\n\n` between paragraphs and `\n- ` before bullets, but
 * nothing about the bug is language-specific — it's a JSON-mode
 * over-escape that any output is susceptible to. We normalize
 * unconditionally.
 *
 * A consecutive run of backslashes preceding `n`/`r`/`t` is
 * disambiguated by parity: an odd run means the trailing `\X` was an
 * over-escape (peel one backslash, drop in the real whitespace),
 * while an even run means the model wrote an already-escaped literal
 * backslash followed by a letter and we leave it alone. This way
 * legitimate `\\n` (literal backslash-n in markdown / code samples)
 * survives untouched.
 *
 * Streaming-safe: a partial that ends mid-escape (`...\`) gets the
 * trailing run of backslashes stripped before normalization and
 * NOT re-attached. The streaming caller's delta computation relies on
 * `normalize(prefix)` being a prefix of `normalize(longer)` — peeling
 * the ambiguous tail guarantees that, since the tail is the only
 * place a future char (`n`) could change an earlier character's
 * normalized form. The deferred backslashes reappear in the next
 * partial's input and get classified there.
 */
export function normalizeLlmJsonEscapes(input: string): string {
  const trailingBackslashes = input.match(/\\+$/);
  const head = trailingBackslashes != null ? input.slice(0, -trailingBackslashes[0].length) : input;
  return head.replace(/(\\+)([nrt])/g, (full, slashes: string, ch: string) => {
    if (slashes.length % 2 === 0) {
      return full;
    }
    const real = ch === 'n' ? '\n' : ch === 't' ? '\t' : '\r';
    return slashes.slice(0, -1) + real;
  });
}
