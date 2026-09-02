import '@tests/integration-tests';
import { NextRequest } from 'next/server';

import { GET as articleGet, POST as articlePost } from '@/app/api/videos/[id]/article/route';
import { POST as readPost } from '@/app/api/videos/[id]/read/route';
import { GET as summaryGet, POST as summaryPost } from '@/app/api/videos/[id]/summary/route';
import { POST as generatePost } from '@/app/api/videos/[id]/transcript/generate/route';
import {
  GET as transcriptGet,
  POST as transcriptPost,
} from '@/app/api/videos/[id]/transcript/route';
import { GET as metaGet } from '@/app/api/videos/meta/route';
import { unsubscribeChannelForUser } from '@/lib/subscriptions';
import { ensureTranscript } from '@/lib/transcripts/ensureTranscript';

/**
 * Route-level half of the "keep marked videos" contract. The reader
 * page and the triage endpoints share `videoReachableByUser`; the
 * content routes (transcript / summary / article), the read toggle,
 * and the meta lookup each carry their own copy of that guard. If one
 * of them drifts back to a subscription-only scope, a starred video
 * whose channel was removed still opens in the reader but 404s on its
 * transcript — so every one of those routes is driven here, once
 * before the unsubscribe and once after, on the same kept video.
 *
 * `lib/__integrationTests__/keptVideosAfterUnsubscribe.test.ts`
 * covers the list views and `assertUserCanTouchVideo`.
 */

// Route handlers import the `prisma` singleton at module load, before
// `beforeAll` swaps in the testcontainer client — resolve it lazily.
const mockGetTestPrisma = () => (global as unknown as { testPrisma: unknown }).testPrisma;
jest.mock('@readtube/database', () => {
  const actual = jest.requireActual('@readtube/database');
  return new Proxy(actual, {
    get(target, prop) {
      if (prop === 'prisma') {
        return mockGetTestPrisma();
      }
      return Reflect.get(target, prop);
    },
  });
});

// Covers both the routes that call `auth()` directly and the ones
// that go through `requireUserId()`.
const USER_ID = 'kept_routes_user';
jest.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: USER_ID }),
}));

// The generate routes hand off to a Vercel Workflow and stream its
// events back; a closed stream is enough to get a response out. What
// matters here is which side of the access check each route lands on.
const mockRun = {
  runId: 'run_kept_routes',
  getReadable: () =>
    new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
};
jest.mock('workflow/api', () => ({
  start: () => Promise.resolve(mockRun),
  getRun: () => mockRun,
}));

// franc / iso-639-3 are ESM-only; same stand-ins as languageCache.test.ts.
jest.mock('franc', () => ({ __esModule: true, franc: () => 'eng' }));
jest.mock('iso-639-3', () => ({ __esModule: true, iso6393To1: { eng: 'en' } }));

// 11-character placeholders so the meta route's YouTube id check passes.
const KEPT_SOURCE_ID = 'kept0000001';
const PLAIN_SOURCE_ID = 'plain000001';

interface Seeded {
  channelId: string;
  kept: string;
  plain: string;
}

async function seed(): Promise<Seeded> {
  await global.testPrisma.user.create({
    data: { source_id: USER_ID, name: 'Kept Routes', email: 'kept_routes@example.com' },
  });
  const channel = await global.testPrisma.channel.create({
    data: {
      source_id: 'kept_routes_chan',
      name: 'Kept Chan',
      rss_url: 'https://example.com/k.xml',
    },
  });
  await global.testPrisma.userSubscription.create({
    data: { user_id: USER_ID, channel_id: channel.id },
  });
  const ids: Record<string, string> = {};
  for (const sourceId of [KEPT_SOURCE_ID, PLAIN_SOURCE_ID]) {
    const video = await global.testPrisma.video.create({
      data: {
        channel_id: channel.id,
        source_id: sourceId,
        title: `Video ${sourceId}`,
        published_at: new Date('2026-01-01T00:00:00Z'),
      },
    });
    // A cached transcript, so the GET routes have something to serve
    // and the generate routes never reach a network call.
    await global.testPrisma.transcript.create({
      data: {
        video_id: video.id,
        text: JSON.stringify([{ startMs: 0, endMs: 1000, text: 'hello' }]),
        fetched_at: new Date(),
      },
    });
    ids[sourceId] = video.id;
  }
  await global.testPrisma.videoStar.create({
    data: { user_id: USER_ID, video_id: ids[KEPT_SOURCE_ID] },
  });
  return { channelId: channel.id, kept: ids[KEPT_SOURCE_ID], plain: ids[PLAIN_SOURCE_ID] };
}

beforeEach(async () => {
  await global.testPrisma.userRequest.deleteMany();
  await global.testPrisma.summary.deleteMany();
  await global.testPrisma.article.deleteMany();
  await global.testPrisma.transcript.deleteMany();
  await global.testPrisma.videoStar.deleteMany();
  await global.testPrisma.userVideoConsumption.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
});

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (path: string) => new NextRequest(`http://test${path}`);

/** Status plus the JSON `error` field (null for streams / empty bodies). */
async function outcome(res: Response): Promise<{ status: number; error: string | null }> {
  let error: string | null = null;
  try {
    error = (await res.clone().json())?.error ?? null;
  } catch {
    // Not JSON — a stream or a 204.
  }
  return { status: res.status, error };
}

interface RouteCase {
  name: string;
  call: (videoId: string, sourceId: string) => Promise<Response>;
}

const ROUTES: RouteCase[] = [
  {
    name: 'transcript GET',
    call: (id) => transcriptGet(req(`/api/videos/${id}/transcript`), params(id)),
  },
  {
    name: 'transcript POST',
    call: (id) => transcriptPost(req(`/api/videos/${id}/transcript`), params(id)),
  },
  {
    name: 'transcript/generate POST',
    call: (id) => generatePost(req(`/api/videos/${id}/transcript/generate`), params(id)),
  },
  { name: 'summary GET', call: (id) => summaryGet(req(`/api/videos/${id}/summary`), params(id)) },
  { name: 'summary POST', call: (id) => summaryPost(req(`/api/videos/${id}/summary`), params(id)) },
  { name: 'article GET', call: (id) => articleGet(req(`/api/videos/${id}/article`), params(id)) },
  { name: 'article POST', call: (id) => articlePost(req(`/api/videos/${id}/article`), params(id)) },
  { name: 'read POST', call: (id) => readPost(req(`/api/videos/${id}/read`), params(id)) },
  {
    name: 'meta GET',
    call: (_id, sourceId) => metaGet(req(`/api/videos/meta?sourceId=${sourceId}`)),
  },
];

describe('content routes after unsubscribing a channel', () => {
  it.each(ROUTES)('$name serves a kept video the same way before and after', async ({ call }) => {
    const seeded = await seed();
    const before = await outcome(await call(seeded.kept, KEPT_SOURCE_ID));
    // Sanity: the seeded state reaches past the access check.
    expect(before.error).not.toBe('Video not found');
    expect(before.error).not.toBe('Not found');

    await unsubscribeChannelForUser(global.testPrisma, USER_ID, seeded.channelId);

    expect(await outcome(await call(seeded.kept, KEPT_SOURCE_ID))).toEqual(before);
  });

  it.each(ROUTES)('$name rejects an unmarked video from the removed channel', async ({ call }) => {
    const seeded = await seed();
    await unsubscribeChannelForUser(global.testPrisma, USER_ID, seeded.channelId);

    const res = await outcome(await call(seeded.plain, PLAIN_SOURCE_ID));
    expect(res.status).toBe(404);
    expect(['Video not found', 'Not found']).toContain(res.error);
  });
});

describe('ensureTranscript after unsubscribing a channel', () => {
  it.each<{ name: string; key: 'kept' | 'plain'; ok: boolean }>([
    { name: 'kept', key: 'kept', ok: true },
    { name: 'unmarked', key: 'plain', ok: false },
  ])('$name video resolves ok=$ok', async ({ key, ok }) => {
    const seeded = await seed();
    await unsubscribeChannelForUser(global.testPrisma, USER_ID, seeded.channelId);

    const result = await ensureTranscript(global.testPrisma, USER_ID, seeded[key]);
    expect(result.ok).toBe(ok);
    if (!result.ok) {
      expect(result.reason).toBe('not-found');
    }
  });
});
