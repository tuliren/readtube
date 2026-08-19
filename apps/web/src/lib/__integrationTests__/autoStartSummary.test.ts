import {
  GenerationStatus,
  TranscriptSource,
  UserRequestOutcome,
  UserRequestType,
} from '@readtube/database';
import '@tests/integration-tests';

import { startAutoSummary } from '@/lib/workflows/summary/autoStart';
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
}: {
  summaryStatus?: GenerationStatus | null;
  summaryWorkflowId?: string | null;
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
      language: 'en',
      source: TranscriptSource.GENERATED,
      fetched_at: new Date(),
    },
  });
  if (summaryStatus != null) {
    await global.testPrisma.summary.create({
      data: {
        transcript_id: transcript.id,
        language: null,
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
