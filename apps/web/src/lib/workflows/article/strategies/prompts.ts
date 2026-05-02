import { ArticleStyle } from '@readtube/database';

import { buildLanguageRule } from '@/lib/language/prompt';

import type { ArticleWorkflowInput } from './types';

function styleGuidance(style: ArticleStyle): string {
  return style === ArticleStyle.DIALOG
    ? `- Format the article as a dialog or interview transcript, preserving exchanges between speakers when the video is conversational.
- If there's only one speaker, format as a reflective monologue with paragraph breaks.`
    : `- Reformat the transcript as an article in GitHub Flavored Markdown. This is a re-formatting task, not a rewriting or summarization task.`;
}

const SHARED_INSTRUCTIONS = `You are an expert editor turning video transcripts into clean, well-formatted articles.

CRITICAL FIDELITY REQUIREMENT: Do NOT summarize, condense, abstract, paraphrase for brevity, or skip any substantive content. Every idea, argument, example, number, quote, and concrete detail in the transcript must appear in the article. The finished article should be roughly the same length as the transcript minus filler words — NOT shorter. If you find yourself compressing or omitting, stop and include the material.`;

const FORMATTING_RULES = `- Use whatever Markdown features best suit the content. Beyond headings and subheadings, also use lists, blockquotes, tables (for comparisons / specs / enumerations), fenced code blocks (for code, commands, file paths, or configuration), inline code for short technical tokens, bold and italic emphasis, horizontal rules to separate unrelated sections, and links where the speaker references them. Pick the feature that best represents each chunk of content.
- Remove only filler words ("um", "uh", "like", "you know"), false starts, repeated words, and verbal tics. Do not remove substantive content.
- Preserve the speaker's voice, phrasing, and stylistic quirks. Keep concrete details, numbers, and examples verbatim.
- Do not invent facts, claims, or details that aren't in the transcript.`;

const NO_PREAMBLE_RULE = `- Start directly with the article content. No preamble of any kind, in any language. Do NOT prefix the article with framing sentences such as "Here is the article", "Below is the article", "The following is...", "以下是...", "下面是...", "이하는...", "次のように...", or any equivalent. The very first character of the output must be the first character of the article body itself (a heading, the opening of the first paragraph, etc.).`;

/**
 * Build the prompt used by the single-pass strategy. Same semantics as
 * the original `buildPrompt` in the article route; relocated so each
 * strategy owns its own prompt construction.
 */
export function buildSinglePassPrompt(input: ArticleWorkflowInput): string {
  const transcriptText = input.segments.map((s) => s.text).join(' ');
  return `${buildLanguageRule(input.language, input.sourceLanguage)}

${SHARED_INSTRUCTIONS}

Instructions:
${styleGuidance(input.style)}
- Structure the article with \`##\` section headings (and \`###\` subheadings where helpful) at every natural topic shift, so the reader can scan and navigate. Aim for a heading roughly every few hundred words; long unbroken prose with no sectioning is a failure mode to avoid. Write descriptive headings that summarize their section, not generic ones like "Introduction" or "Part 1". Skip headings only when the entire article is a single short topic.
${FORMATTING_RULES}
- Do not include the video title as a top-level heading — it will be shown separately.
${NO_PREAMBLE_RULE}

Video title: ${input.videoTitle}
Channel: ${input.channelName}

Transcript:
${transcriptText}`;
}

/**
 * Build the prompt for one section of the map-reduce strategy. The
 * model is told this is one section of a larger article and is asked
 * for body prose only — the heading is generated separately and goes
 * through the reduce pass.
 */
export function buildSectionPrompt(
  input: ArticleWorkflowInput,
  options: {
    sectionIndex: number;
    sectionsTotal: number;
    sectionText: string;
  }
): string {
  return `${buildLanguageRule(input.language, input.sourceLanguage)}

${SHARED_INSTRUCTIONS}

Instructions:
${styleGuidance(input.style)}
- You are writing ONE SECTION of a longer article (section ${options.sectionIndex + 1} of ${options.sectionsTotal}). Other sections are being written in parallel by other calls; an editor will combine your output with theirs.
- Output the section body as flowing markdown prose. Use \`###\` subheadings within the section if the content benefits from internal structure, but DO NOT include a top-level heading at the start — the section heading is produced separately and will be inserted by the assembler.
- Also produce a short \`topic\` field: a 3–7 word noun phrase describing what this section covers. No "Section X" prefix, no numbering. The editor may rewrite this in a final pass; aim for descriptive but not overly clever.
${FORMATTING_RULES}
${NO_PREAMBLE_RULE}

Video title: ${input.videoTitle}
Channel: ${input.channelName}

Section transcript (covers part of the full video):
${options.sectionText}`;
}

/**
 * Build the prompt for the reduce pass that consolidates per-section
 * topics into a coherent outline + an article-level title.
 */
export function buildReducePrompt(
  input: ArticleWorkflowInput,
  briefs: Array<{ index: number; topic: string; brief: string }>
): string {
  const sectionsBlock = briefs
    .map((b) => `${b.index + 1}. "${b.topic}"\n   ${b.brief}`)
    .join('\n\n');
  return `${buildLanguageRule(input.language, input.sourceLanguage)}

You are an editor consolidating the section structure of an article that was written piece-by-piece. Each section was generated independently, so the proposed headings may be redundant ("Roman empire history" / "Roman empire details"), inconsistent, or generic. Produce a clean, non-redundant outline.

Video title: ${input.videoTitle}
Channel: ${input.channelName}

Per-section proposed headings and brief excerpts (in article order):

${sectionsBlock}

Return:
- articleTitle: a 5–10 word title for the entire article. Should reflect the article's actual content; it will be displayed alongside the video title.
- headings: a list with one entry PER SECTION, in the same order as the input. For each section produce a short heading. If a section reads as a continuation of the previous one and shouldn't have its own heading, return an empty string for that entry; the assembler will then render it without a heading.

Headings must collectively form a coherent outline of the whole article. Avoid generic words like "Introduction", "Part 1", "Conclusion" unless they're genuinely the most descriptive choice.`;
}
