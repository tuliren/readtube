import { z } from 'zod';

import {
  SECTION_BODIES,
  SHORT_FULL_DISTINCTION,
  type SummaryField,
} from '@/lib/workflows/summary/promptSections';

const HAS_LATEX_DESCRIPTION =
  'True if this field\'s content contains at least one LaTeX math formula wrapped in single or double dollar signs (e.g. $E = mc^2$ or $$\\int_0^1 x\\,dx$$). False otherwise. Dollar amounts like "$5 million" are not math and must not set this flag to true.';

// Field descriptions reuse the prompt section bodies verbatim (single
// source of truth in promptSections.ts), plus schema-only rules.
const NO_FRONTMATTER_RULE = 'Do not include any YAML frontmatter.';
const HEADLINE_DESCRIPTION = SECTION_BODIES.headline;
const SHORT_CONTENT_DESCRIPTION = `${SECTION_BODIES.short}\n${NO_FRONTMATTER_RULE}`;
const FULL_CONTENT_DESCRIPTION = `${SECTION_BODIES.full}\n${NO_FRONTMATTER_RULE}`;

export function buildSummarySchema(fields: readonly SummaryField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  if (fields.includes('headline')) {
    shape.headline = z.string().describe(HEADLINE_DESCRIPTION);
  }
  // `full` before `short` on purpose: the model generates fields in
  // schema property order, and writing the full summary first (then
  // distilling the short from it) keeps the full from anchoring on a
  // just-written digest. See SUMMARY_FIELDS in promptSections.ts.
  if (fields.includes('full')) {
    // The write-full-first / distill-short note only makes sense when
    // both fields are generated in this call; a standalone full regen
    // has no short field to distill into.
    const fullDescription = fields.includes('short')
      ? `${SECTION_BODIES.full}\n${SHORT_FULL_DISTINCTION}\n${NO_FRONTMATTER_RULE}`
      : FULL_CONTENT_DESCRIPTION;
    shape.full = z.object({
      content: z.string().describe(fullDescription),
      hasLatex: z.boolean().describe(HAS_LATEX_DESCRIPTION),
    });
  }
  if (fields.includes('short')) {
    shape.short = z.object({
      content: z.string().describe(SHORT_CONTENT_DESCRIPTION),
      hasLatex: z.boolean().describe(HAS_LATEX_DESCRIPTION),
    });
  }
  return z.object(shape);
}

interface StructuredField {
  content: string;
  hasLatex: boolean;
}

/** Shape of a completed object from {@link buildSummarySchema}; only
 *  the requested fields are present. */
export interface SummaryObject {
  headline?: string;
  full?: StructuredField;
  short?: StructuredField;
}
