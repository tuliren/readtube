export type SummaryField = 'headline' | 'short' | 'full';
export const SUMMARY_FIELDS: readonly SummaryField[] = ['headline', 'short', 'full'] as const;

/**
 * Per-field generation rules. Single source of truth for the model-facing
 * text: buildSummaryPrompt embeds these as prompt sections, and
 * buildSummarySchema reuses them as the structured-output field
 * descriptions, so the two can never drift apart.
 */
export const SECTION_BODIES: Record<SummaryField, string> = {
  headline: `HEADLINE — a very short newspaper-style title.
- Title style, not a sentence.
- Under 10 words. Shorter is better.
- Plain text only — no markdown, no surrounding quotes, no "Title:" prefix.`,
  short: `SHORT SUMMARY — a one-paragraph digest of 3-5 sentences.
- First sentence: the essential point.
- The rest: the most important supporting context and arguments.
- Plain prose. No headings, no lists, no preamble.`,
  full: `FULL SUMMARY — a substantially richer overview: cover every distinct argument, conclusion, and key supporting point.
- Aim for 3-4x the length of the short summary whenever the transcript has enough distinct content; if the video is genuinely thin, a shorter full summary is fine — never pad.
- If your full summary comes out barely longer than the short summary, you are over-compressing: go back and include the arguments, evidence, and reasoning you cut.
- Cut only repetition, filler, and off-topic tangents.
- Default to prose: 3-5 short paragraphs.
- Use a Markdown bullet list ("- ") only when the video itself is a list of discrete items (steps, tips, rankings, list-of-N) — and even then, open with at least one sentence of prose before the list. Never write the entire summary as bullets.
- Bullets are terse one-liners, single-level only.
- Never use headings (no #, ##, etc.). Occasional bold or italics for emphasis are fine.`,
};

export const SHORT_FULL_DISTINCTION =
  'The short and full summaries serve different purposes — the short is a one-paragraph digest; the full is a substantially longer overview that covers all key arguments, aiming for 3-4x the length of the short whenever the content supports it. The full summary is NOT a truncation of the short; write each independently against its own rules.';
