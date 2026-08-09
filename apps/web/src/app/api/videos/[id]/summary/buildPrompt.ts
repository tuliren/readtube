import { buildLanguageRule } from '@/lib/language/prompt';
import {
  SECTION_BODIES,
  SHORT_FULL_DISTINCTION,
  type SummaryField,
} from '@/lib/workflows/summary/promptSections';

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
    fields.includes('short') && fields.includes('full') ? `\n${SHORT_FULL_DISTINCTION}\n` : '';
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
