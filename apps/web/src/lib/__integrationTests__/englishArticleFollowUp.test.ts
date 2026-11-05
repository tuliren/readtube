import { ArticleStyle, GenerationStatus, TranscriptSource } from '@readtube/database';
import '@tests/integration-tests';
import { franc } from 'franc';

import { startEnglishArticleFollowUp } from '@/lib/workflows/article/englishFollowUp';
import type { ArticleWorkflowInput } from '@/lib/workflows/article/strategies/types';

const mockStart = jest.fn();
const mockGetRun = jest.fn();
jest.mock('workflow/api', () => ({
  start: (...args: unknown[]) => mockStart(...args),
  getRun: (runId: string) => mockGetRun(runId),
}));

// The workflow and its steps pull in the model / embedding stack; this
// suite only exercises the follow-up control flow.
jest.mock('@/lib/workflows/article', () => ({ articleWorkflow: 'articleWorkflow' }));
jest.mock('@/lib/workflows/article/steps', () => ({ ARTICLE_PROMPT_VERSION: 'vtest' }));

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

const STYLE = ArticleStyle.NARRATIVE;

let seedCounter = 0;

async function seed(
  transcriptLanguage: string | null
): Promise<{ videoId: string; transcriptId: string }> {
  seedCounter++;
  const tag = `eaf${seedCounter}`;
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
  return { videoId: video.id, transcriptId: transcript.id };
}

/**
 * Input as the article POST builds it: an Original run carries the
 * detected source language, a target run carries null.
 */
function buildInput(
  transcriptId: string,
  language: string | null,
  sourceLanguage: string | null
): ArticleWorkflowInput {
  return {
    transcriptId,
    style: STYLE,
    language,
    segments: [{ startMs: 0, endMs: 4000, text: 'Placeholder transcript text.' }],
    videoTitle: 'Follow-up test video',
    channelName: 'Follow-up channel',
    sourceLanguage: language == null ? sourceLanguage : null,
    durationSeconds: 600,
    userRequestId: 'original-request',
  };
}

async function seedArticle(
  transcriptId: string,
  language: string | null,
  content: string | null
): Promise<void> {
  await global.testPrisma.article.create({
    data: {
      transcript_id: transcriptId,
      style: STYLE,
      language,
      status: GenerationStatus.READY,
      content,
      prompt_version: 'vtest',
      model: 'test-model',
    },
  });
}

beforeEach(async () => {
  await global.testPrisma.userRequest.deleteMany();
  await global.testPrisma.article.deleteMany();
  await global.testPrisma.transcript.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  mockStart.mockReset();
  mockGetRun.mockReset();
  mockStart.mockResolvedValue({ runId: 'run_english' });
});

describe('startEnglishArticleFollowUp', () => {
  it.each([
    {
      label: 'a non-English target over a non-English source',
      language: 'zh-Hans',
      transcriptLanguage: 'ja',
      slot: 'en',
      slotSource: null,
    },
    {
      label: 'a non-English target over an English source',
      language: 'zh-Hans',
      transcriptLanguage: 'en',
      slot: null,
      slotSource: 'en',
    },
    {
      label: 'an Original of a non-English source',
      language: null,
      transcriptLanguage: 'zh',
      slot: 'en',
      slotSource: null,
    },
  ])(
    'starts the English run after $label',
    async ({ language, transcriptLanguage, slot, slotSource }) => {
      const { transcriptId } = await seed(transcriptLanguage);

      await startEnglishArticleFollowUp(
        global.testPrisma,
        buildInput(transcriptId, language, transcriptLanguage)
      );

      expect(mockStart).toHaveBeenCalledTimes(1);
      const [, [workflowInput]] = mockStart.mock.calls[0] as [unknown, [ArticleWorkflowInput]];
      expect(workflowInput.language).toBe(slot);
      expect(workflowInput.style).toBe(STYLE);
      expect(workflowInput.sourceLanguage).toBe(slotSource);
      // No audit row: the user didn't ask for the English sibling.
      expect(workflowInput.userRequestId).toBeNull();
      expect(await global.testPrisma.userRequest.count()).toBe(0);

      const article = await global.testPrisma.article.findFirstOrThrow({
        where: { transcript_id: transcriptId, style: STYLE, language: slot },
      });
      expect(article.status).toBe(GenerationStatus.GENERATING);
      expect(article.workflow_id).toBe('run_english');
    }
  );

  it('starts an en run after a non-English target over an undetectable source', async () => {
    const { transcriptId } = await seed(null);
    jest.mocked(franc).mockReturnValueOnce('und');

    await startEnglishArticleFollowUp(global.testPrisma, buildInput(transcriptId, 'ja', null));

    expect(mockStart).toHaveBeenCalledTimes(1);
    const [, [workflowInput]] = mockStart.mock.calls[0] as [unknown, [ArticleWorkflowInput]];
    expect(workflowInput.language).toBe('en');
  });

  it.each([
    { label: 'an English target', language: 'en', transcriptLanguage: 'zh' },
    { label: 'an Original of an English source', language: null, transcriptLanguage: 'en' },
    { label: 'an Original of an undetectable source', language: null, transcriptLanguage: null },
  ])('does nothing after $label', async ({ language, transcriptLanguage }) => {
    const { transcriptId } = await seed(transcriptLanguage ?? 'en');

    await startEnglishArticleFollowUp(
      global.testPrisma,
      buildInput(transcriptId, language, transcriptLanguage)
    );

    expect(mockStart).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'an en article exists for a non-English source',
      transcriptLanguage: 'zh',
      language: null,
      existing: 'en',
    },
    {
      label: 'an English Original exists',
      transcriptLanguage: 'en',
      language: 'ja',
      existing: null,
    },
    {
      label: 'an en article exists for an English source',
      transcriptLanguage: 'en',
      language: 'ja',
      existing: 'en',
    },
  ])('does nothing when $label', async ({ transcriptLanguage, language, existing }) => {
    const { transcriptId } = await seed(transcriptLanguage);
    await seedArticle(transcriptId, existing, 'Existing English article');

    await startEnglishArticleFollowUp(
      global.testPrisma,
      buildInput(transcriptId, language, transcriptLanguage)
    );

    expect(mockStart).not.toHaveBeenCalled();
  });

  it('starts a run when the READY English article has no content', async () => {
    const { transcriptId } = await seed('zh');
    await seedArticle(transcriptId, 'en', null);

    await startEnglishArticleFollowUp(global.testPrisma, buildInput(transcriptId, null, 'zh'));

    expect(mockStart).toHaveBeenCalledTimes(1);
  });
});
