import {
  GenerationStatus,
  TranscriptSource,
  UserRequestOutcome,
  UserRequestType,
} from '@readtube/database';
import '@tests/integration-tests';

import { startAutoSummary, startEnglishSummaryFollowUp } from '@/lib/workflows/summary/autoStart';
import { SUMMARY_PROMPT_VERSION } from '@/lib/workflows/summary/steps';

jest.mock('@readtube/database', () => {
  const actual = jest.requireActual('@readtube/database');
  const prismaProxy = new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      return (global as unknown as { testPrisma: Record<string, unknown> }).testPrisma[prop];
    },
  });
  return { ...actual, prisma: prismaProxy };
});

const mockStart = jest.fn();
const mockGetRun = jest.fn();
jest.mock('workflow/api', () => ({
  start: (...args: unknown[]) => mockStart(...args),
  getRun: (runId: string) => mockGetRun(runId),
}));

// franc / iso-639-3 are ESM and ts-jest can't transform them — same
// deterministic stand-in as languageCache.test.ts (this suite only
// exercises the auto-start control flow, not language detection).
jest.mock('franc', () => ({
  __esModule: true,
  franc: jest.fn((text: string) => (text.trim().length === 0 ? 'und' : 'eng')),
}));
jest.mock('iso-639-3', () => ({
  __esModule: true,
  iso6393To1: { eng: 'en' },
}));

const TEST_USER_ID = 'clerk_auto_summary_user';
const RUN_ID = 'run_auto_summary_1';

let seedCounter = 0;

async function seed({
  summaryStatus = null,
  summaryWorkflowId = null,
  summaryLanguage = null,
  transcriptLanguage = 'en',
}: {
  summaryStatus?: GenerationStatus | null;
  summaryWorkflowId?: string | null;
  summaryLanguage?: string | null;
  transcriptLanguage?: string;
} = {}): Promise<{ videoId: string; transcriptId: string }> {
  seedCounter++;
  const tag = `as${seedCounter}`;

  const channel = await global.testPrisma.channel.create({
    data: {
      source_id: `${tag}-channel`,
      name: 'Auto summary channel',
      rss_url: `https://example.com/${tag}.xml`,
    },
  });
  await global.testPrisma.userSubscription.create({
    data: { user_id: TEST_USER_ID, channel_id: channel.id },
  });
  const video = await global.testPrisma.video.create({
    data: {
      channel_id: channel.id,
      source_id: `${tag}-video`,
      title: 'Auto summary test video',
      published_at: new Date('2026-01-01T00:00:00Z'),
      transcript_unavailable: true,
    },
  });
  const transcript = await global.testPrisma.transcript.create({
    data: {
      video_id: video.id,
      text: JSON.stringify([
        { startMs: 0, endMs: 4000, text: 'The quick brown fox jumps over the lazy dog.' },
        { startMs: 4000, endMs: 8000, text: 'This sentence exists to give franc some text.' },
      ]),
      language: transcriptLanguage,
      source: TranscriptSource.GENERATED,
      fetched_at: new Date(),
    },
  });
  if (summaryStatus != null) {
    await global.testPrisma.summary.create({
      data: {
        transcript_id: transcript.id,
        language: summaryLanguage,
        status: summaryStatus,
        workflow_id: summaryWorkflowId,
        prompt_version: SUMMARY_PROMPT_VERSION,
        model: 'test-model',
        headline: summaryStatus === GenerationStatus.READY ? 'Existing headline' : null,
        short: summaryStatus === GenerationStatus.READY ? 'Existing short' : null,
        full: summaryStatus === GenerationStatus.READY ? 'Existing full' : null,
      },
    });
  }
  return { videoId: video.id, transcriptId: transcript.id };
}

beforeEach(async () => {
  await global.testPrisma.userRequest.deleteMany();
  await global.testPrisma.summary.deleteMany();
  await global.testPrisma.transcript.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
  await global.testPrisma.user.create({
    data: { source_id: TEST_USER_ID, name: 'Test', email: `${TEST_USER_ID}@example.com` },
  });
  mockStart.mockReset();
  mockGetRun.mockReset();
  mockStart.mockResolvedValue({ runId: RUN_ID });
});

describe('startAutoSummary', () => {
  it('starts a full summary run, claims the slot, and records a pending audit row', async () => {
    const { videoId, transcriptId } = await seed();

    await startAutoSummary(global.testPrisma, {
      userId: TEST_USER_ID,
      videoDbId: videoId,
      transcriptId,
    });

    expect(mockStart).toHaveBeenCalledTimes(1);
    const [, [workflowInput]] = mockStart.mock.calls[0] as [
      unknown,
      [
        {
          fieldsToGenerate: string[];
          prompt: string;
          transcriptId: string;
          language: string | null;
          userRequestId: string | null;
        },
      ],
    ];
    expect(workflowInput.transcriptId).toBe(transcriptId);
    expect(workflowInput.language).toBeNull();
    expect(workflowInput.fieldsToGenerate).toEqual(['headline', 'full', 'short']);
    expect(workflowInput.prompt).toContain('Auto summary test video');
    expect(workflowInput.prompt).toContain('The quick brown fox');
    expect(workflowInput.userRequestId).not.toBeNull();

    const summary = await global.testPrisma.summary.findFirstOrThrow({
      where: { transcript_id: transcriptId, language: null },
    });
    expect(summary.status).toBe(GenerationStatus.GENERATING);
    expect(summary.workflow_id).toBe(RUN_ID);

    const request = await global.testPrisma.userRequest.findUniqueOrThrow({
      where: { id: workflowInput.userRequestId! },
    });
    expect(request.type).toBe(UserRequestType.SUMMARY);
    expect(request.outcome).toBe(UserRequestOutcome.GENERATED);
    expect(request.completed_at).toBeNull();
    expect(request.workflow_id).toBe(RUN_ID);
  });

  it('does nothing when a READY summary already exists for the slot', async () => {
    const { videoId, transcriptId } = await seed({ summaryStatus: GenerationStatus.READY });

    await startAutoSummary(global.testPrisma, {
      userId: TEST_USER_ID,
      videoDbId: videoId,
      transcriptId,
    });

    expect(mockStart).not.toHaveBeenCalled();
    const rows = await global.testPrisma.userRequest.findMany();
    expect(rows).toHaveLength(0);
  });

  it('does nothing when another summary run is already active for the slot', async () => {
    const { videoId, transcriptId } = await seed({
      summaryStatus: GenerationStatus.GENERATING,
      summaryWorkflowId: 'run_someone_else',
    });
    mockGetRun.mockReturnValue({ status: Promise.resolve('running') });

    await startAutoSummary(global.testPrisma, {
      userId: TEST_USER_ID,
      videoDbId: videoId,
      transcriptId,
    });

    expect(mockStart).not.toHaveBeenCalled();
    const summary = await global.testPrisma.summary.findFirstOrThrow({
      where: { transcript_id: transcriptId },
    });
    expect(summary.workflow_id).toBe('run_someone_else');
  });
});

describe('startAutoSummary return value', () => {
  it.each([
    { label: 'a target run', language: 'zh-Hans', sourceLanguage: null },
    { label: 'an Original run', language: null, sourceLanguage: 'en' },
  ])(
    'describes $label and leaves the English follow-up to the caller',
    async ({ language, sourceLanguage }) => {
      const { videoId, transcriptId } = await seed();

      const started = await startAutoSummary(global.testPrisma, {
        userId: TEST_USER_ID,
        videoDbId: videoId,
        transcriptId,
        language,
      });

      expect(started).toEqual({ language, sourceLanguage });
      expect(mockStart).toHaveBeenCalledTimes(1);
    }
  );

  it('returns null when nothing was started', async () => {
    const { videoId, transcriptId } = await seed({ summaryStatus: GenerationStatus.READY });

    const started = await startAutoSummary(global.testPrisma, {
      userId: TEST_USER_ID,
      videoDbId: videoId,
      transcriptId,
    });

    expect(started).toBeNull();
  });
});

describe('startEnglishSummaryFollowUp', () => {
  function startedLanguages(): (string | null)[] {
    return mockStart.mock.calls.map(
      ([, [input]]) => (input as { language: string | null }).language
    );
  }

  it.each([
    { label: 'a non-English target', language: 'zh-Hans', sourceLanguage: null },
    { label: 'an Original of a non-English source', language: null, sourceLanguage: 'zh' },
  ])('queues an English run after $label', async ({ language, sourceLanguage }) => {
    const { videoId, transcriptId } = await seed();

    await startEnglishSummaryFollowUp(global.testPrisma, {
      userId: TEST_USER_ID,
      videoDbId: videoId,
      transcriptId,
      language,
      sourceLanguage,
    });

    expect(startedLanguages()).toEqual(['en']);
    const english = await global.testPrisma.summary.findFirstOrThrow({
      where: { transcript_id: transcriptId, language: 'en' },
    });
    expect(english.status).toBe(GenerationStatus.GENERATING);
    expect(english.workflow_id).toBe(RUN_ID);
    // No audit row: the user didn't ask for the English sibling.
    const [, [workflowInput]] = mockStart.mock.calls[0] as [
      unknown,
      [{ userRequestId: string | null }],
    ];
    expect(workflowInput.userRequestId).toBeNull();
    expect(await global.testPrisma.userRequest.count()).toBe(0);
  });

  it.each([
    { label: 'an English target', language: 'en', sourceLanguage: null },
    { label: 'an Original of an English source', language: null, sourceLanguage: 'en' },
    { label: 'an Original of an undetectable source', language: null, sourceLanguage: null },
  ])('does not queue an English run after $label', async ({ language, sourceLanguage }) => {
    const { videoId, transcriptId } = await seed();

    await startEnglishSummaryFollowUp(global.testPrisma, {
      userId: TEST_USER_ID,
      videoDbId: videoId,
      transcriptId,
      language,
      sourceLanguage,
    });

    expect(mockStart).not.toHaveBeenCalled();
  });

  it('does not queue an English run when an English summary is already READY', async () => {
    const { videoId, transcriptId } = await seed({
      summaryStatus: GenerationStatus.READY,
      summaryLanguage: 'en',
    });

    await startEnglishSummaryFollowUp(global.testPrisma, {
      userId: TEST_USER_ID,
      videoDbId: videoId,
      transcriptId,
      language: 'ja',
      sourceLanguage: null,
    });

    expect(mockStart).not.toHaveBeenCalled();
  });

  it('clones an English Original instead of starting a run', async () => {
    const { videoId, transcriptId } = await seed({
      summaryStatus: GenerationStatus.READY,
      transcriptLanguage: 'en',
    });

    await startEnglishSummaryFollowUp(global.testPrisma, {
      userId: TEST_USER_ID,
      videoDbId: videoId,
      transcriptId,
      language: 'ja',
      sourceLanguage: null,
    });

    expect(mockStart).not.toHaveBeenCalled();
    const english = await global.testPrisma.summary.findFirstOrThrow({
      where: { transcript_id: transcriptId, language: 'en' },
    });
    expect(english.headline).toBe('Existing headline');
  });
});
