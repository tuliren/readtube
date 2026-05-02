import { buildSummaryPrompt } from '@/app/api/videos/[id]/summary/buildPrompt';

type SummaryField = 'headline' | 'short' | 'full';
const SUMMARY_FIELDS: readonly SummaryField[] = ['headline', 'short', 'full'] as const;

const TITLE = 'How transformers work';
const CHANNEL = 'AI Explained';
const TRANSCRIPT = 'transcript-body-xyz';

describe('buildSummaryPrompt', () => {
  it.each<{ name: string; fields: SummaryField[] }>([
    { name: 'all three', fields: [...SUMMARY_FIELDS] },
    { name: 'short only', fields: ['short'] },
    { name: 'full only', fields: ['full'] },
    { name: 'headline only', fields: ['headline'] },
    { name: 'short + full', fields: ['short', 'full'] },
  ])('includes the transcript exactly once for $name', ({ fields }) => {
    const prompt = buildSummaryPrompt(fields, null, 'en', TITLE, CHANNEL, TRANSCRIPT);
    const occurrences = prompt.split(TRANSCRIPT).length - 1;
    expect(occurrences).toBe(1);
  });

  it('includes all three sections when all fields are requested', () => {
    const prompt = buildSummaryPrompt([...SUMMARY_FIELDS], null, 'en', TITLE, CHANNEL, TRANSCRIPT);
    expect(prompt).toContain('HEADLINE');
    expect(prompt).toContain('SHORT SUMMARY');
    expect(prompt).toContain('FULL SUMMARY');
  });

  it.each<{ name: string; fields: SummaryField[]; absent: string[] }>([
    {
      name: 'short only',
      fields: ['short'],
      absent: ['HEADLINE', 'FULL SUMMARY'],
    },
    {
      name: 'full only',
      fields: ['full'],
      absent: ['HEADLINE', 'SHORT SUMMARY'],
    },
    {
      name: 'headline only',
      fields: ['headline'],
      absent: ['SHORT SUMMARY', 'FULL SUMMARY'],
    },
  ])('omits non-requested sections for $name', ({ fields, absent }) => {
    const prompt = buildSummaryPrompt(fields, null, 'en', TITLE, CHANNEL, TRANSCRIPT);
    for (const section of absent) {
      expect(prompt).not.toContain(section);
    }
  });

  it('only includes the short-vs-full distinction when both are requested', () => {
    const distinctionMarker = 'NOT a truncation';

    const both = buildSummaryPrompt(['short', 'full'], null, 'en', TITLE, CHANNEL, TRANSCRIPT);
    expect(both).toContain(distinctionMarker);

    const shortOnly = buildSummaryPrompt(['short'], null, 'en', TITLE, CHANNEL, TRANSCRIPT);
    expect(shortOnly).not.toContain(distinctionMarker);

    const fullOnly = buildSummaryPrompt(['full'], null, 'en', TITLE, CHANNEL, TRANSCRIPT);
    expect(fullOnly).not.toContain(distinctionMarker);
  });

  it('embeds the language rule, video title and channel name', () => {
    const prompt = buildSummaryPrompt([...SUMMARY_FIELDS], 'fr', null, TITLE, CHANNEL, TRANSCRIPT);
    expect(prompt).toContain('CRITICAL LANGUAGE REQUIREMENT');
    expect(prompt).toContain(`Video title: ${TITLE}`);
    expect(prompt).toContain(`Channel: ${CHANNEL}`);
  });
});
