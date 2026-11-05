import { GenerationStatus, TranscriptSource } from '@readtube/database';
import '@tests/integration-tests';
import { franc } from 'franc';

import { startEnglishSummaryFollowUp } from '@/lib/workflows/summary/englishFollowUp';
import type { FullSummaryRunInput } from '@/lib/workflows/summary/fullRun';

const mockStart = jest.fn();
const mockGetRun = jest.fn();
jest.mock('workflow/api', () => ({
  start: (...args: unknown[]) => mockStart(...args),
  getRun: (runId: string) => mockGetRun(runId),
}));

// franc / iso-639-3 are ESM and ts-jest can't transform them — same
// stand-in as languageCache.test.ts. Detection only runs for a
// transcript seeded without a language.
jest.mock('franc', () => ({
  __esModule: true,
  franc: jest.fn(() => 'eng'),
}));
jest.mock('iso-639-3', () => ({
  __esModule: true,
  iso6393To1: { eng: 'en' },
}));

let seedCounter = 0;

async function seed(transcriptLanguage: string | null): Promise<string> {
  seedCounter++;
  const tag = `esf${seedCounter}`;
  const channel = await global.testPrisma.channel.create({
    data: {
      source_id: `${tag}-channel`,
      name: 'Follow-up channel',
      rss_url: `https://example.com/${tag}.xml`,
    },
  });
  const video = await global.testPrisma.video.create({
    data: {
      channel_id: channel.id,
      source_id: `${tag}-video`,
      title: 'Follow-up test video',
      published_at: new Date('2026-01-01T00:00:00Z'),
    },
  });
  const transcript = await global.testPrisma.transcript.create({
    data: {
      video_id: video.id,
      text: JSON.stringify([{ startMs: 0, endMs: 4000, text: 'Placeholder transcript text.' }]),
      language: transcriptLanguage,
      source: TranscriptSource.CAPTIONS,
      fetched_at: new Date(),
    },
  });
  return transcript.id;
}

/**
 * Input as the summary POST builds it: an Original run carries the
 * detected source language, a target run carries null.
 */
function buildInput(
  transcriptId: string,
  language: string | null,
  sourceLanguage: string | null
): FullSummaryRunInput {
  return {
    transcriptId,
    language,
    sourceLanguage: language == null ? sourceLanguage : null,
    transcriptText: 'Placeholder transcript text.',
    videoTitle: 'Follow-up test video',
    channelName: 'Follow-up channel',
  };
}

async function seedSummary(
  transcriptId: string,
  language: string | null,
  headline: string | null
): Promise<void> {
  await global.testPrisma.summary.create({
    data: {
      transcript_id: transcriptId,
      language,
      status: GenerationStatus.READY,
      headline,
      short: 'Existing short',
      full: 'Existing full',
      prompt_version: 'vtest',
      model: 'test-model',
    },
  });
}

beforeEach(async () => {
  await global.testPrisma.userRequest.deleteMany();
  await global.testPrisma.summary.deleteMany();
  await global.testPrisma.transcript.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  mockStart.mockReset();
  mockGetRun.mockReset();
  mockStart.mockResolvedValue({ runId: 'run_english' });
});

describe('startEnglishSummaryFollowUp', () => {
  it.each([
    {
      label: 'a non-English target over a non-English source',
      language: 'zh-Hans',
      transcriptLanguage: 'ja',
      slot: 'en',
    },
    {
      label: 'a non-English target over an English source',
      language: 'zh-Hans',
      transcriptLanguage: 'en',
      slot: null,
    },
    {
      label: 'an Original of a non-English source',
      language: null,
      transcriptLanguage: 'zh',
      slot: 'en',
    },
  ])('starts the English run after $label', async ({ language, transcriptLanguage, slot }) => {
    const transcriptId = await seed(transcriptLanguage);

    await startEnglishSummaryFollowUp(
      global.testPrisma,
      buildInput(transcriptId, language, transcriptLanguage)
    );

    expect(mockStart).toHaveBeenCalledTimes(1);
    const [, [workflowInput]] = mockStart.mock.calls[0] as [
      unknown,
      [{ language: string | null; prompt: string; userRequestId: string | null }],
    ];
    expect(workflowInput.language).toBe(slot);
    // Reuses the caller's transcript text instead of re-reading it.
    expect(workflowInput.prompt).toContain('Placeholder transcript text.');
    // No audit row: the user didn't ask for the English sibling.
    expect(workflowInput.userRequestId).toBeNull();
    expect(await global.testPrisma.userRequest.count()).toBe(0);

    const english = await global.testPrisma.summary.findFirstOrThrow({
      where: { transcript_id: transcriptId, language: slot },
    });
    expect(english.status).toBe(GenerationStatus.GENERATING);
    expect(english.workflow_id).toBe('run_english');
  });

  it('starts an en run after a non-English target over an undetectable source', async () => {
    const transcriptId = await seed(null);
    jest.mocked(franc).mockReturnValueOnce('und');

    await startEnglishSummaryFollowUp(global.testPrisma, buildInput(transcriptId, 'ja', null));

    expect(mockStart).toHaveBeenCalledTimes(1);
    const [, [workflowInput]] = mockStart.mock.calls[0] as [unknown, [{ language: string | null }]];
    expect(workflowInput.language).toBe('en');
  });

  it.each([
    { label: 'an English target', language: 'en', transcriptLanguage: 'zh' },
    { label: 'an Original of an English source', language: null, transcriptLanguage: 'en' },
    { label: 'an Original of an undetectable source', language: null, transcriptLanguage: null },
  ])('does nothing after $label', async ({ language, transcriptLanguage }) => {
    const transcriptId = await seed(transcriptLanguage ?? 'en');

    await startEnglishSummaryFollowUp(
      global.testPrisma,
      buildInput(transcriptId, language, transcriptLanguage)
    );

    expect(mockStart).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'a complete en summary exists for a non-English source',
      transcriptLanguage: 'zh',
      language: null,
      existing: 'en',
    },
    {
      label: 'a complete English Original exists',
      transcriptLanguage: 'en',
      language: 'ja',
      existing: null,
    },
    {
      label: 'a complete en summary exists for an English source',
      transcriptLanguage: 'en',
      language: 'ja',
      existing: 'en',
    },
  ])('does nothing when $label', async ({ transcriptLanguage, language, existing }) => {
    const transcriptId = await seed(transcriptLanguage);
    await seedSummary(transcriptId, existing, 'Existing English headline');

    await startEnglishSummaryFollowUp(
      global.testPrisma,
      buildInput(transcriptId, language, transcriptLanguage)
    );

    expect(mockStart).not.toHaveBeenCalled();
  });

  it('starts a run when the READY English summary is incomplete', async () => {
    const transcriptId = await seed('zh');
    await seedSummary(transcriptId, 'en', null);

    await startEnglishSummaryFollowUp(global.testPrisma, buildInput(transcriptId, null, 'zh'));

    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a repeat call while the first English run is active', async () => {
    const transcriptId = await seed('zh');
    mockGetRun.mockReturnValue({ status: Promise.resolve('running') });

    await startEnglishSummaryFollowUp(global.testPrisma, buildInput(transcriptId, null, 'zh'));
    await startEnglishSummaryFollowUp(global.testPrisma, buildInput(transcriptId, null, 'zh'));

    expect(mockStart).toHaveBeenCalledTimes(1);
  });
});
