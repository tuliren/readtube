/**
 * Display helpers for channel names in the sidebar.
 *
 * Many YouTube channels prefix their name with a decorative emoji
 * ("🚀 Fireship", "✨ MKBHD"). In the sidebar we want clean, uniform
 * typography so the hierarchy (category → folder → channel) reads
 * clearly — emojis add noise at the left edge and fight the `Radio`
 * icon for visual weight. Strip leading emojis at render time rather
 * than mutating the stored name, so the raw name stays intact for
 * search and for display in other contexts.
 */

/**
 * Regex matching a leading run of emoji-ish characters: Extended
 * Pictographic (the canonical "this is an emoji" property), emoji
 * modifiers (skin tones), ZWJ and variation selectors used to stitch
 * multi-codepoint emoji together, and any whitespace between or after
 * them. Non-leading emojis (e.g. "Foo 🎉 Bar") are left alone — the
 * intent is to drop the decorative prefix, not to sanitize everything.
 *
 * Built with `new RegExp` (rather than a literal) for two reasons:
 *   1. The workspace tsconfig targets es5, so a literal `/.../u` is
 *      rejected by TS even though every runtime we ship to supports
 *      it. Passing the flag as a runtime string sidesteps the check.
 *   2. Using alternation instead of a character class avoids the
 *      `no-misleading-character-class` lint warning that would fire
 *      if ZWJ (\u200d) and VS16 (\ufe0f) appeared inside `[...]`.
 */
const LEADING_EMOJI_RE = new RegExp(
  '^(?:\\p{Extended_Pictographic}|\\p{Emoji_Modifier}|\\u200d|\\ufe0f|\\s)+',
  'u'
);

/**
 * Strip a leading emoji prefix from a channel name for display.
 *
 * Returns the original name unchanged if the result would be empty
 * (e.g. a channel named only with emojis) — an empty sidebar row is
 * worse than showing the emoji.
 */
export function displayChannelName(name: string): string {
  const stripped = name.replace(LEADING_EMOJI_RE, '');
  if (stripped.length === 0) {
    return name;
  }
  return stripped;
}
