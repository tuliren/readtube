import { ArticleStyle, GenerationStatus, TranscriptSource } from '@readtube/database';
import '@tests/integration-tests';

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
// stand-in as languageCache.test.ts. Transcripts here carry a cached
// language, so detection never runs.
jest.mock('franc', () => ({
  __esModule: true,
  franc: jest.fn(() => 'eng'),
}));
jest.mock('iso-639-3', () => ({
  __esModule: true,
  iso6393To1: { eng: 'en' },
}));

const TEST_USER_ID = 'clerk_english_article_user';
const STYLE = ArticleStyle.NARRATIVE;

let seedCounter = 0;

async function seed(
  transcriptLanguage: string
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

function buildInput(transcriptId: string, language: string | null): ArticleWorkflowInput {
  return {
    transcriptId,
    style: STYLE,
    language,
    segments: [{ startMs: 0, endMs: 4000, text: 'Placeholder transcript text.' }],
    videoTitle: 'Follow-up test video',
    channelName: 'Follow-up channel',
    sourceLanguage: null,
    durationSeconds: 600,
    userRequestId: 'original-request',
  };
}

beforeEach(async () => {
  await global.testPrisma.userRequest.deleteMany();
  await global.testPrisma.article.deleteMany();
  await global.testPrisma.transcript.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
  await global.testPrisma.user.create({
    data: { source_id: TEST_USER_ID, name: 'Test', email: `${TEST_USER_ID}@example.com` },
  });
  mockStart.mockReset();
  mockGetRun.mockReset();
  mockStart.mockResolvedValue({ runId: 'run_english' });
});

describe('startEnglishArticleFollowUp', () => {
  it.each([
    { label: 'a non-English target', language: 'zh-Hans', transcriptLanguage: 'en' },
    { label: 'an Original of a non-English source', language: null, transcriptLanguage: 'zh' },
  ])('starts an English article after $label', async ({ language, transcriptLanguage }) => {
    const { videoId, transcriptId } = await seed(transcriptLanguage);

    await startEnglishArticleFollowUp(global.testPrisma, {
      userId: TEST_USER_ID,
      videoDbId: videoId,
      input: buildInput(transcriptId, language),
    });

    expect(mockStart).toHaveBeenCalledTimes(1);
    const [, [workflowInput]] = mockStart.mock.calls[0] as [unknown, [ArticleWorkflowInput]];
    expect(workflowInput.language).toBe('en');
    expect(workflowInput.style).toBe(STYLE);
    expect(workflowInput.sourceLanguage).toBeNull();
    expect(workflowInput.userRequestId).not.toBe('original-request');

    const article = await global.testPrisma.article.findFirstOrThrow({
      where: { transcript_id: transcriptId, style: STYLE, language: 'en' },
    });
    expect(article.status).toBe(GenerationStatus.GENERATING);
    expect(article.workflow_id).toBe('run_english');
    const request = await global.testPrisma.userRequest.findUniqueOrThrow({
      where: { id: workflowInput.userRequestId! },
    });
    expect(request.language).toBe('en');
    expect(request.workflow_id).toBe('run_english');
  });

  it.each([
    { label: 'an English target', language: 'en', transcriptLanguage: 'zh' },
    { label: 'an Original of an English source', language: null, transcriptLanguage: 'en' },
  ])('does nothing after $label', async ({ language, transcriptLanguage }) => {
    const { videoId, transcriptId } = await seed(transcriptLanguage);

    await startEnglishArticleFollowUp(global.testPrisma, {
      userId: TEST_USER_ID,
      videoDbId: videoId,
      input: buildInput(transcriptId, language),
    });

    expect(mockStart).not.toHaveBeenCalled();
  });

  it('does nothing when an English article in the style is already READY', async () => {
    const { videoId, transcriptId } = await seed('zh');
    await global.testPrisma.article.create({
      data: {
        transcript_id: transcriptId,
        style: STYLE,
        language: 'en',
        status: GenerationStatus.READY,
        content: 'Existing English article',
        prompt_version: 'vtest',
        model: 'test-model',
      },
    });

    await startEnglishArticleFollowUp(global.testPrisma, {
      userId: TEST_USER_ID,
      videoDbId: videoId,
      input: buildInput(transcriptId, null),
    });

    expect(mockStart).not.toHaveBeenCalled();
  });
});
