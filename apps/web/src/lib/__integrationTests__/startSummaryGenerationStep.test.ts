import { GenerationStatus, TranscriptSource } from '@readtube/database';
import '@tests/integration-tests';

import { startSummaryGenerationStep } from '@/lib/workflows/transcript-generation/steps';

/**
 * Wiring of the transcript-generation step's summary handoff: the auto
 * summary starts before the generation marker is released, and the
 * English follow-up after it — including on a retried step that finds
 * its own earlier summary run still active.
 */

jest.mock('@readtube/database', () => {
  const actual = jest.requireActual('@readtube/database');
  const prismaProxy = new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      return (global as unknown as { testPrisma: Record<string, unknown> }).testPrisma[prop];
    },
  });
  return { ...actual, prisma: prismaProxy };
});

const TRANSCRIPT_RUN_ID = 'run_transcript_generation';
jest.mock('workflow', () => ({
  FatalError: class FatalError extends Error {},
  getWorkflowMetadata: () => ({ workflowRunId: TRANSCRIPT_RUN_ID }),
}));

const mockStart = jest.fn();
jest.mock('workflow/api', () => ({
  start: (...args: unknown[]) => mockStart(...args),
  getRun: () => ({ status: Promise.resolve('running') }),
}));

// The step module also holds the Gemini transcription steps; this suite
// never reaches them.
jest.mock('@/lib/ai/geminiVideo', () => ({}));

// franc / iso-639-3 are ESM and ts-jest can't transform them — same
// stand-in as languageCache.test.ts. Transcripts here carry a cached
// language, so detection never runs.
jest.mock('franc', () => ({ __esModule: true, franc: () => 'eng' }));
jest.mock('iso-639-3', () => ({ __esModule: true, iso6393To1: { eng: 'en' } }));

const USER_ID = 'clerk_summary_step_user';

interface Seeded {
  videoId: string;
  transcriptId: string;
}

async function seed(): Promise<Seeded> {
  await global.testPrisma.user.create({
    data: {
      source_id: USER_ID,
      name: 'Step',
      email: `${USER_ID}@example.com`,
      preferred_language: 'zh-Hans',
    },
  });
  const channel = await global.testPrisma.channel.create({
    data: { source_id: 'step-channel', name: 'Step channel', rss_url: 'https://example.com/s.xml' },
  });
  const video = await global.testPrisma.video.create({
    data: {
      channel_id: channel.id,
      source_id: 'step-video',
      title: 'Step video',
      published_at: new Date('2026-01-01T00:00:00Z'),
      transcript_generation_status: GenerationStatus.GENERATING,
      transcript_generation_workflow_id: TRANSCRIPT_RUN_ID,
    },
  });
  const transcript = await global.testPrisma.transcript.create({
    data: {
      video_id: video.id,
      text: JSON.stringify([{ startMs: 0, endMs: 4000, text: 'Placeholder transcript text.' }]),
      // Non-English source, so the follow-up's slot is `en` (an
      // English source would send it to the Original instead).
      language: 'ja',
      source: TranscriptSource.GENERATED,
      fetched_at: new Date(),
    },
  });
  return { videoId: video.id, transcriptId: transcript.id };
}

/** Each started run's language and the generation marker at that moment. */
const started: { language: string | null; marker: GenerationStatus | null }[] = [];

beforeEach(async () => {
  await global.testPrisma.userRequest.deleteMany();
  await global.testPrisma.summary.deleteMany();
  await global.testPrisma.transcript.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
  started.length = 0;
  let runCounter = 0;
  mockStart.mockReset();
  mockStart.mockImplementation(async (_workflow, [input]: [{ language: string | null }]) => {
    const video = await global.testPrisma.video.findFirstOrThrow({
      select: { transcript_generation_status: true },
    });
    started.push({ language: input.language, marker: video.transcript_generation_status });
    return { runId: `run_${++runCounter}` };
  });
});

function runStep({ videoId, transcriptId }: Seeded): Promise<void> {
  return startSummaryGenerationStep(
    {
      videoDbId: videoId,
      videoSourceId: 'step-video',
      durationSeconds: 600,
      userId: USER_ID,
      userRequestId: null,
    },
    transcriptId
  );
}

describe('startSummaryGenerationStep', () => {
  it('starts the auto summary before the release and the English follow-up after it', async () => {
    const seeded = await seed();

    await runStep(seeded);

    expect(started).toEqual([
      { language: 'zh-Hans', marker: GenerationStatus.GENERATING },
      { language: 'en', marker: GenerationStatus.READY },
    ]);
  });

  it('still queues the English follow-up on a retry that finds its summary run active', async () => {
    const seeded = await seed();
    // The first attempt started the zh-Hans run, then died before the
    // English follow-up.
    await global.testPrisma.summary.create({
      data: {
        transcript_id: seeded.transcriptId,
        language: 'zh-Hans',
        status: GenerationStatus.GENERATING,
        workflow_id: 'run_first_attempt',
        prompt_version: 'vtest',
        model: 'test-model',
      },
    });

    await runStep(seeded);

    expect(started.map((s) => s.language)).toEqual(['en']);
  });
});
