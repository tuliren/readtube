import { UserRequestOutcome, UserRequestType } from '@readtube/database';
import '@tests/integration-tests';

import { SubtitleFetchError } from '@/lib/platforms/types';
import { ensureTranscript } from '@/lib/transcripts/ensureTranscript';

// Stub the YouTube subtitle fetcher — the helper that
// YouTubePlatform.fetchTranscript ultimately delegates to. Each test
// drives this mock to simulate cache-miss / success / transient /
// permanent-unavailable, then asserts the UserRequest row that
// ensureTranscript writes.
jest.mock('@readtube/database', () => {
  const actual = jest.requireActual('@readtube/database');
  const prismaProxy = new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      return (global as unknown as { testPrisma: Record<string, unknown> }).testPrisma[prop];
    },
  });
  return { ...actual, prisma: prismaProxy };
});

const mockFetchSubtitleViaTranscriptApi = jest.fn();
jest.mock('@/lib/platforms/youtube/subtitles/fetchViaTranscriptApi', () => ({
  fetchSubtitleViaTranscriptApi: (videoId: string) => mockFetchSubtitleViaTranscriptApi(videoId),
}));

const TEST_USER_ID = 'clerk_ensure_transcript_user';

interface SeedResult {
  videoId: string;
}

let seedCounter = 0;

async function seed({
  withTranscript = false,
  transcriptUnavailable = false,
}: {
  withTranscript?: boolean;
  transcriptUnavailable?: boolean;
} = {}): Promise<SeedResult> {
  seedCounter++;
  const tag = `et${seedCounter}`;

  const channel = await global.testPrisma.channel.create({
    data: {
      source_id: `${tag}-channel`,
      name: 'Test channel',
      rss_url: `https://example.com/${tag}.xml`,
    },
  });

  // Subscribe the user to the channel — the IDOR predicate in
  // ensureTranscript requires a UserSubscription row (or a
  // standalone-video / playlist link).
  await global.testPrisma.userSubscription.create({
    data: { user_id: TEST_USER_ID, channel_id: channel.id },
  });

  const video = await global.testPrisma.video.create({
    data: {
      channel_id: channel.id,
      source_id: `${tag}-video`,
      title: 'Test video',
      published_at: new Date('2026-01-01T00:00:00Z'),
      transcript_unavailable: transcriptUnavailable,
    },
  });

  if (withTranscript) {
    await global.testPrisma.transcript.create({
      data: {
        video_id: video.id,
        text: JSON.stringify([{ text: 'hello', start: 0, duration: 1 }]),
        language: 'en',
        fetched_at: new Date('2026-01-01T00:00:00Z'),
      },
    });
  }

  return { videoId: video.id };
}

beforeEach(async () => {
  // Order matters: child tables before parents. Cascades cover most
  // but explicit deletes keep the cleanup obvious.
  await global.testPrisma.userRequest.deleteMany();
  await global.testPrisma.summary.deleteMany();
  await global.testPrisma.article.deleteMany();
  await global.testPrisma.transcript.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
  await global.testPrisma.user.create({
    data: { source_id: TEST_USER_ID, name: 'Test', email: `${TEST_USER_ID}@example.com` },
  });
  mockFetchSubtitleViaTranscriptApi.mockReset();
});

async function userRequestRows() {
  return global.testPrisma.userRequest.findMany({
    where: { user_id: TEST_USER_ID, type: UserRequestType.TRANSCRIPT },
    orderBy: { created_at: 'asc' },
  });
}

describe('ensureTranscript audit log', () => {
  it('records CACHED on a transcript cache hit and does not call upstream', async () => {
    const { videoId } = await seed({ withTranscript: true });

    const result = await ensureTranscript(global.testPrisma, TEST_USER_ID, videoId);

    expect(result.ok).toBe(true);
    expect(mockFetchSubtitleViaTranscriptApi).not.toHaveBeenCalled();
    const rows = await userRequestRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe(UserRequestOutcome.CACHED);
    expect(rows[0].video_id).toBe(videoId);
    expect(rows[0].transcript_id).not.toBeNull();
    expect(rows[0].completed_at).not.toBeNull();
  });

  it('records UNAVAILABLE_STICKY when transcript_unavailable is set', async () => {
    const { videoId } = await seed({ transcriptUnavailable: true });

    const result = await ensureTranscript(global.testPrisma, TEST_USER_ID, videoId);

    expect(result).toEqual({ ok: false, reason: 'unavailable' });
    expect(mockFetchSubtitleViaTranscriptApi).not.toHaveBeenCalled();
    const rows = await userRequestRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe(UserRequestOutcome.UNAVAILABLE_STICKY);
    expect(rows[0].transcript_id).toBeNull();
  });

  it('records GENERATED on a successful upstream fetch', async () => {
    const { videoId } = await seed();
    mockFetchSubtitleViaTranscriptApi.mockResolvedValue({
      segments: [{ text: 'fresh content', start: 0, duration: 1 }],
      language: 'en',
    });

    const result = await ensureTranscript(global.testPrisma, TEST_USER_ID, videoId);

    expect(result.ok).toBe(true);
    const rows = await userRequestRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe(UserRequestOutcome.GENERATED);
    expect(rows[0].transcript_id).not.toBeNull();
  });

  it('records TRANSIENT_ERROR on a transient upstream failure and does NOT flip sticky flag', async () => {
    const { videoId } = await seed();
    mockFetchSubtitleViaTranscriptApi.mockRejectedValue(
      new SubtitleFetchError('rate limited', { transient: true })
    );

    const result = await ensureTranscript(global.testPrisma, TEST_USER_ID, videoId);

    expect(result).toEqual({ ok: false, reason: 'transient-error' });
    const rows = await userRequestRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe(UserRequestOutcome.TRANSIENT_ERROR);
    expect(rows[0].error_message).toContain('rate limited');

    const video = await global.testPrisma.video.findUnique({ where: { id: videoId } });
    expect(video?.transcript_unavailable).toBe(false);
  });

  it('records UNAVAILABLE_FRESH on a permanent upstream failure and flips sticky flag', async () => {
    const { videoId } = await seed();
    mockFetchSubtitleViaTranscriptApi.mockRejectedValue(
      new SubtitleFetchError('no captions', { transient: false })
    );

    const result = await ensureTranscript(global.testPrisma, TEST_USER_ID, videoId);

    expect(result).toEqual({ ok: false, reason: 'unavailable' });
    const rows = await userRequestRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe(UserRequestOutcome.UNAVAILABLE_FRESH);
    expect(rows[0].error_message).toContain('no captions');

    const video = await global.testPrisma.video.findUnique({ where: { id: videoId } });
    expect(video?.transcript_unavailable).toBe(true);
  });

  it('does not record any row when the IDOR check fails (NOT_FOUND)', async () => {
    // Seed a video the user is NOT subscribed to.
    seedCounter++;
    const tag = `et${seedCounter}-other`;
    const channel = await global.testPrisma.channel.create({
      data: { source_id: `${tag}-channel`, name: 'Other', rss_url: `https://x/${tag}.xml` },
    });
    const video = await global.testPrisma.video.create({
      data: {
        channel_id: channel.id,
        source_id: `${tag}-video`,
        title: 'Other',
        published_at: new Date('2026-01-01T00:00:00Z'),
      },
    });

    const result = await ensureTranscript(global.testPrisma, TEST_USER_ID, video.id);

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(mockFetchSubtitleViaTranscriptApi).not.toHaveBeenCalled();
    const rows = await userRequestRows();
    // We deliberately skip writing on NOT_FOUND — the FK on user_id is
    // still valid, but we don't want to leak any signal on whether the
    // video exists.
    expect(rows).toHaveLength(0);
  });
});
