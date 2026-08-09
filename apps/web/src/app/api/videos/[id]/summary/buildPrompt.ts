import { buildLanguageRule } from '@/lib/language/prompt';
import {
  SECTION_BODIES,
  SHORT_FULL_DISTINCTION,
  type SummaryField,
} from '@/lib/workflows/summary/promptSections';

/**
 * Already-stored summary fields that are NOT part of this generation.
 * Used by per-field regeneration: the FULL SUMMARY rules calibrate
 * length against the short summary, so a full-only regen must see the
 * existing short — without it the model has no anchor and collapses
 * to digest length. Symmetrically, a short-only regen distills from
 * the existing full.
 */
export interface ExistingSummaryFields {
  short?: string;
  full?: string;
}

function buildExistingContext(
  fields: readonly SummaryField[],
  existing: ExistingSummaryFields | undefined
): string {
  if (existing == null) {
    return '';
  }
  if (fields.includes('full') && !fields.includes('short') && existing.short != null) {
    return `\nFor calibration, here is the existing SHORT SUMMARY (not part of this generation):
${existing.short}

The FULL SUMMARY must be substantially longer and more detailed than this — present each key point with its justification and examples, not just the core point.\n`;
  }
  if (fields.includes('short') && !fields.includes('full') && existing.full != null) {
    return `\nFor reference, here is the existing FULL SUMMARY (not part of this generation):
${existing.full}

Distill the SHORT SUMMARY from it, consistent with the transcript.\n`;
  }
  return '';
}

export function buildSummaryPrompt(
  fields: readonly SummaryField[],
  target: string | null,
  sourceLanguage: string | null,
  title: string,
  channelName: string,
  transcript: string,
  existing?: ExistingSummaryFields
): string {
  const sections = fields.map((field) => SECTION_BODIES[field]);
  const distinction =
    fields.includes('short') && fields.includes('full') ? `\n${SHORT_FULL_DISTINCTION}\n` : '';
  const existingContext = buildExistingContext(fields, existing);
  const intro =
    fields.length === 1
      ? 'Produce one summary of this video as a JSON object that matches the schema. Follow the rules below exactly.'
      : `Produce ${fields.length} summaries of this video as a single JSON object that matches the schema. Each output has a distinct purpose — follow each one's rules independently.`;

  return `${buildLanguageRule(target, sourceLanguage)}

${intro}

${sections.join('\n\n')}
${distinction}${existingContext}
For any field that has a hasLatex flag, set it to true only if that field's content contains an actual LaTeX math formula wrapped in $...$ or $$...$$ (e.g. $E = mc^2$). Dollar amounts like "$5 million" are not math.

Video title: ${title}
Channel: ${channelName}

Transcript:
${transcript}`;
}
