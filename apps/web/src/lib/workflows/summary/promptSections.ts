export type SummaryField = 'headline' | 'short' | 'full';
// Order matters: it sets both the prompt section order and the JSON
// schema property order, and the model generates fields in schema
// order. `full` deliberately precedes `short` — the model writes the
// rich summary directly from the transcript first, then distills the
// short one from it. The reverse order anchored the full summary on
// the just-written digest and it came out barely longer.
export const SUMMARY_FIELDS: readonly SummaryField[] = ['headline', 'full', 'short'] as const;

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
- Big picture only — leave out specific examples, numbers, and step-by-step details.
- Plain prose. No headings, no lists, no preamble.`,
  full: `FULL SUMMARY — a condensed article covering everything that matters in the video.
- Write it directly from the transcript — never as an expansion of the short summary.
- Cover every distinct argument and conclusion, and for each one keep the speaker's key reasoning and the most illustrative specifics: examples, numbers, names, steps.
- Cut only repetition, filler, and off-topic tangents.
- A typical video yields 3-4x the length of the short summary; if the video is genuinely thin, shorter is fine — never pad.
- Default to prose: 3-5 short paragraphs.
- Use a Markdown bullet list ("- ") only when the video itself is a list of discrete items (steps, tips, rankings, list-of-N) — and even then, open with at least one sentence of prose before the list. Never write the entire summary as bullets.
- Bullets are terse one-liners, single-level only.
- Never use headings (no #, ##, etc.). Occasional bold or italics for emphasis are fine.`,
};

export const SHORT_FULL_DISTINCTION =
  'The field order is deliberate: write the FULL summary first, directly from the transcript, then distill the SHORT summary from the full. The two differ in altitude, not just length — the full keeps every argument with its evidence and specifics; the short keeps only the core point and the most important context.';
