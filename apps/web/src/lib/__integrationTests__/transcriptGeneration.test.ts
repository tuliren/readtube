import {
  GenerationStatus,
  TranscriptSource,
  UserRequestOutcome,
  UserRequestType,
} from '@readtube/database';
import '@tests/integration-tests';

import { persistTranscript } from '@/lib/transcripts/ensureTranscript';
import { completeUserRequest, recordTranscriptRequest } from '@/lib/usage/userRequest';
import {
  claimTranscriptGeneration,
  findActiveTranscriptGeneration,
  releaseTranscriptGeneration,
  revertTranscriptGeneration,
} from '@/lib/workflows/runRegistry';

jest.mock('@readtube/database', () => {
  const actual = jest.requireActual('@readtube/database');
  const prismaProxy = new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      return (global as unknown as { testPrisma: Record<string, unknown> }).testPrisma[prop];
    },
  });
  return { ...actual, prisma: prismaProxy };
});

// The registry helpers probe the workflow runtime via getRun().status
// to distinguish live runs from stale markers. Drive it per test.
const mockGetRun = jest.fn();
jest.mock('workflow/api', () => ({
  getRun: (runId: string) => mockGetRun(runId),
}));

const TEST_USER_ID = 'clerk_transcript_generation_user';
const RUN_ID = 'run_generation_1';
const OTHER_RUN_ID = 'run_generation_2';

let seedCounter = 0;

async function seedVideo({
  generationStatus = GenerationStatus.READY,
  workflowId = null,
  generationError = null,
}: {
  generationStatus?: GenerationStatus;
  workflowId?: string | null;
  generationError?: string | null;
} = {}): Promise<{ videoId: string }> {
  seedCounter++;
  const tag = `tg${seedCounter}`;

  const channel = await global.testPrisma.channel.create({
    data: {
      source_id: `${tag}-channel`,
      name: 'Test channel',
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
      title: 'Test video',
      published_at: new Date('2026-01-01T00:00:00Z'),
      transcript_unavailable: true,
      transcript_generation_status: generationStatus,
      transcript_generation_workflow_id: workflowId,
      transcript_generation_error: generationError,
    },
  });
  return { videoId: video.id };
}

async function videoRow(videoId: string) {
  return global.testPrisma.video.findUniqueOrThrow({ where: { id: videoId } });
}

beforeEach(async () => {
  await global.testPrisma.userRequest.deleteMany();
  await global.testPrisma.transcript.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
  await global.testPrisma.user.create({
    data: { source_id: TEST_USER_ID, name: 'Test', email: `${TEST_USER_ID}@example.com` },
  });
  mockGetRun.mockReset();
});

describe('claimTranscriptGeneration', () => {
  it('claims a READY row, stamps the workflow id, and clears a prior error', async () => {
    const { videoId } = await seedVideo({ generationError: 'previous failure' });

    const claimed = await claimTranscriptGeneration(global.testPrisma, videoId, RUN_ID);

    expect(claimed).toBe(true);
    const video = await videoRow(videoId);
    expect(video.transcript_generation_status).toBe(GenerationStatus.GENERATING);
    expect(video.transcript_generation_workflow_id).toBe(RUN_ID);
    expect(video.transcript_generation_error).toBeNull();
  });

  it('loses against a row already claimed by another run', async () => {
    const { videoId } = await seedVideo({
      generationStatus: GenerationStatus.GENERATING,
      workflowId: OTHER_RUN_ID,
    });

    const claimed = await claimTranscriptGeneration(global.testPrisma, videoId, RUN_ID);

    expect(claimed).toBe(false);
    const video = await videoRow(videoId);
    expect(video.transcript_generation_workflow_id).toBe(OTHER_RUN_ID);
  });
});

describe('releaseTranscriptGeneration', () => {
  it('flips the row back to READY and keeps the workflow id for trace', async () => {
    const { videoId } = await seedVideo({
      generationStatus: GenerationStatus.GENERATING,
      workflowId: RUN_ID,
    });

    await releaseTranscriptGeneration(global.testPrisma, videoId, RUN_ID);

    const video = await videoRow(videoId);
    expect(video.transcript_generation_status).toBe(GenerationStatus.READY);
    expect(video.transcript_generation_workflow_id).toBe(RUN_ID);
  });

  it('does not release a row owned by a different run', async () => {
    const { videoId } = await seedVideo({
      generationStatus: GenerationStatus.GENERATING,
      workflowId: OTHER_RUN_ID,
    });

    await releaseTranscriptGeneration(global.testPrisma, videoId, RUN_ID);

    const video = await videoRow(videoId);
    expect(video.transcript_generation_status).toBe(GenerationStatus.GENERATING);
  });
});

describe('revertTranscriptGeneration', () => {
  it('reverts to READY with the failure message', async () => {
    const { videoId } = await seedVideo({
      generationStatus: GenerationStatus.GENERATING,
      workflowId: RUN_ID,
    });

    await revertTranscriptGeneration(global.testPrisma, videoId, RUN_ID, 'model exploded');

    const video = await videoRow(videoId);
    expect(video.transcript_generation_status).toBe(GenerationStatus.READY);
    expect(video.transcript_generation_error).toBe('model exploded');
  });
});

describe('findActiveTranscriptGeneration', () => {
  it.each<{ desc: string; runtimeStatus: string; expectActive: boolean }>([
    { desc: 'pending run counts as active', runtimeStatus: 'pending', expectActive: true },
    { desc: 'running run counts as active', runtimeStatus: 'running', expectActive: true },
    { desc: 'completed run is not active', runtimeStatus: 'completed', expectActive: false },
    { desc: 'failed run is not active', runtimeStatus: 'failed', expectActive: false },
  ])('$desc', async ({ runtimeStatus, expectActive }) => {
    const { videoId } = await seedVideo({
      generationStatus: GenerationStatus.GENERATING,
      workflowId: RUN_ID,
    });
    mockGetRun.mockReturnValue({ status: Promise.resolve(runtimeStatus) });

    const active = await findActiveTranscriptGeneration(global.testPrisma, videoId);

    if (expectActive) {
      expect(active).toEqual({ runId: RUN_ID });
    } else {
      expect(active).toBeNull();
    }
  });

  it('recovers a stale GENERATING marker with a timeout message', async () => {
    const { videoId } = await seedVideo({
      generationStatus: GenerationStatus.GENERATING,
      workflowId: RUN_ID,
    });
    mockGetRun.mockReturnValue({ status: Promise.resolve('failed') });

    await findActiveTranscriptGeneration(global.testPrisma, videoId);

    const video = await videoRow(videoId);
    expect(video.transcript_generation_status).toBe(GenerationStatus.READY);
    expect(video.transcript_generation_error).toContain('timed out');
  });

  it('returns null for an idle READY row without touching it', async () => {
    const { videoId } = await seedVideo();

    const active = await findActiveTranscriptGeneration(global.testPrisma, videoId);

    expect(active).toBeNull();
    expect(mockGetRun).not.toHaveBeenCalled();
  });
});

describe('persistTranscript provenance', () => {
  it('stores source GENERATED and skips the audit row when recordAudit is false', async () => {
    const { videoId } = await seedVideo();

    const created = await persistTranscript(global.testPrisma, {
      userId: TEST_USER_ID,
      videoId,
      segments: [{ startMs: 0, endMs: 5000, text: 'generated text' }],
      language: 'en',
      source: TranscriptSource.GENERATED,
      recordAudit: false,
    });

    const transcript = await global.testPrisma.transcript.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(transcript.source).toBe(TranscriptSource.GENERATED);
    const rows = await global.testPrisma.userRequest.findMany();
    expect(rows).toHaveLength(0);
  });

  it('defaults to source CAPTIONS with an audit row', async () => {
    const { videoId } = await seedVideo();

    const created = await persistTranscript(global.testPrisma, {
      userId: TEST_USER_ID,
      videoId,
      segments: [{ startMs: 0, endMs: 5000, text: 'caption text' }],
      language: 'en',
    });

    const transcript = await global.testPrisma.transcript.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(transcript.source).toBe(TranscriptSource.CAPTIONS);
    const rows = await global.testPrisma.userRequest.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe(UserRequestOutcome.GENERATED);
  });
});

describe('pending transcript UserRequest lifecycle', () => {
  it('inserts a pending row and backfills it on completion', async () => {
    const { videoId } = await seedVideo();

    const request = await recordTranscriptRequest(global.testPrisma, {
      userId: TEST_USER_ID,
      videoId,
      outcome: UserRequestOutcome.GENERATED,
      model: 'google/test-model',
      promptVersion: 'v1',
      pending: true,
    });

    const pending = await global.testPrisma.userRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(pending.type).toBe(UserRequestType.TRANSCRIPT);
    expect(pending.completed_at).toBeNull();
    expect(pending.model).toBe('google/test-model');
    expect(pending.prompt_version).toBe('v1');

    const transcript = await global.testPrisma.transcript.create({
      data: {
        video_id: videoId,
        text: JSON.stringify([{ startMs: 0, endMs: 1000, text: 'hi' }]),
        language: 'en',
        source: TranscriptSource.GENERATED,
        fetched_at: new Date(),
      },
    });
    await completeUserRequest(global.testPrisma, request.id, {
      outcome: UserRequestOutcome.GENERATED,
      usage: { inputTokens: 100, outputTokens: 10 },
      transcriptId: transcript.id,
    });

    const completed = await global.testPrisma.userRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(completed.completed_at).not.toBeNull();
    expect(completed.transcript_id).toBe(transcript.id);
    expect(completed.usage).toEqual({ inputTokens: 100, outputTokens: 10 });
  });

  it('flips a pending row to FAILED with the error message', async () => {
    const { videoId } = await seedVideo();

    const request = await recordTranscriptRequest(global.testPrisma, {
      userId: TEST_USER_ID,
      videoId,
      outcome: UserRequestOutcome.GENERATED,
      pending: true,
    });
    await completeUserRequest(global.testPrisma, request.id, {
      outcome: UserRequestOutcome.FAILED,
      errorMessage: 'generation failed',
    });

    const failed = await global.testPrisma.userRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(failed.outcome).toBe(UserRequestOutcome.FAILED);
    expect(failed.error_message).toBe('generation failed');
    expect(failed.completed_at).not.toBeNull();
  });
});
