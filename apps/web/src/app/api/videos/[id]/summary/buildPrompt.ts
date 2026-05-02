import { buildLanguageRule } from '@/lib/language/prompt';
import { type SummaryField } from '@/lib/workflows/summary/steps';

const SECTION_BODIES: Record<SummaryField, string> = {
  headline: `HEADLINE — a very short newspaper-style title.
- Title style, not a sentence.
- Under 10 words. Shorter is better.
- Plain text only — no markdown, no surrounding quotes, no "Title:" prefix.`,
  short: `SHORT SUMMARY — a tight 2-3 sentence digest.
- First sentence: the essential point.
- 1-2 more sentences: the most important supporting context.
- Plain prose. No headings, no lists, no preamble.`,
  full: `FULL SUMMARY — a compact but richer overview, meaningfully longer than the short summary.
- Focus on main arguments and conclusions; cut examples, tangents, and non-essential details.
- Favor density over completeness — a reader should get the gist in under a minute.
- Pick the format that fits the content:
  - 2-3 short paragraphs of prose when the video is one continuous argument.
  - A Markdown bullet list ("- ") when the video naturally breaks into discrete items (steps, tips, comparisons, list-of-N).
  - A mix when an introductory point is followed by enumerated takeaways.
- Bullets are terse one-liners, single-level only.
- Never use headings (no #, ##, etc.). Do not bold or italicize.`,
};

export function buildSummaryPrompt(
  fields: readonly SummaryField[],
  target: string | null,
  sourceLanguage: string | null,
  title: string,
  channelName: string,
  transcript: string
): string {
  const sections = fields.map((field) => SECTION_BODIES[field]);
  const distinction =
    fields.includes('short') && fields.includes('full')
      ? `\nThe short and full summaries serve different purposes — the short is a 2-3 sentence digest, the full is a denser, structured overview that is meaningfully longer and richer. The full summary is NOT a truncation of the short; write each independently against its own rules.\n`
      : '';
  const intro =
    fields.length === 1
      ? 'Produce one summary of this video as a JSON object that matches the schema. Follow the rules below exactly.'
      : `Produce ${fields.length} summaries of this video as a single JSON object that matches the schema. Each output has a distinct purpose — follow each one's rules independently.`;

  return `${buildLanguageRule(target, sourceLanguage)}

${intro}

${sections.join('\n\n')}
${distinction}
For any field that has a hasLatex flag, set it to true only if that field's content contains an actual LaTeX math formula wrapped in $...$ or $$...$$ (e.g. $E = mc^2$). Dollar amounts like "$5 million" are not math.

Video title: ${title}
Channel: ${channelName}

Transcript:
${transcript}`;
}
