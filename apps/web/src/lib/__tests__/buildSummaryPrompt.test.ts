import { buildSummaryPrompt } from '@/lib/workflows/summary/buildPrompt';
import { SUMMARY_FIELDS, type SummaryField } from '@/lib/workflows/summary/promptSections';

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

  it('places the full section before the short section', () => {
    const prompt = buildSummaryPrompt([...SUMMARY_FIELDS], null, 'en', TITLE, CHANNEL, TRANSCRIPT);
    expect(prompt.indexOf('FULL SUMMARY')).toBeGreaterThan(-1);
    expect(prompt.indexOf('FULL SUMMARY')).toBeLessThan(prompt.indexOf('SHORT SUMMARY'));
  });

  it('only includes the short-vs-full distinction when both are requested', () => {
    const distinctionMarker = 'distill the SHORT summary';

    const both = buildSummaryPrompt(['short', 'full'], null, 'en', TITLE, CHANNEL, TRANSCRIPT);
    expect(both).toContain(distinctionMarker);

    const shortOnly = buildSummaryPrompt(['short'], null, 'en', TITLE, CHANNEL, TRANSCRIPT);
    expect(shortOnly).not.toContain(distinctionMarker);

    const fullOnly = buildSummaryPrompt(['full'], null, 'en', TITLE, CHANNEL, TRANSCRIPT);
    expect(fullOnly).not.toContain(distinctionMarker);
  });

  it.each<{
    name: string;
    fields: SummaryField[];
    existing: { short?: string; full?: string };
    present: string[];
    absent: string[];
  }>([
    {
      name: 'full-only regen sees the existing short',
      fields: ['full'],
      existing: { short: 'existing-short-abc' },
      present: ['existing-short-abc', 'substantially longer'],
      absent: [],
    },
    {
      name: 'short-only regen sees the existing full',
      fields: ['short'],
      existing: { full: 'existing-full-def' },
      present: ['existing-full-def', 'Distill the SHORT SUMMARY'],
      absent: [],
    },
    {
      name: 'both-field generation ignores existing content',
      fields: ['short', 'full'],
      existing: { short: 'existing-short-abc', full: 'existing-full-def' },
      present: [],
      absent: ['existing-short-abc', 'existing-full-def'],
    },
    {
      name: 'full-only regen without a stored short adds no context',
      fields: ['full'],
      existing: {},
      present: [],
      absent: ['existing SHORT SUMMARY'],
    },
  ])('$name', ({ fields, existing, present, absent }) => {
    const prompt = buildSummaryPrompt(fields, null, 'en', TITLE, CHANNEL, TRANSCRIPT, existing);
    for (const marker of present) {
      expect(prompt).toContain(marker);
    }
    for (const marker of absent) {
      expect(prompt).not.toContain(marker);
    }
  });

  it('embeds the language rule, video title and channel name', () => {
    const prompt = buildSummaryPrompt([...SUMMARY_FIELDS], 'fr', null, TITLE, CHANNEL, TRANSCRIPT);
    expect(prompt).toContain('CRITICAL LANGUAGE REQUIREMENT');
    expect(prompt).toContain(`Video title: ${TITLE}`);
    expect(prompt).toContain(`Channel: ${CHANNEL}`);
  });
});
