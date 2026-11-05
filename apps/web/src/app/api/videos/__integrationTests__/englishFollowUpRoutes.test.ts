import { ArticleStyle } from '@readtube/database';
import '@tests/integration-tests';
import { NextRequest } from 'next/server';

import { POST as articlePost } from '@/app/api/videos/[id]/article/route';
import { POST as summaryPost } from '@/app/api/videos/[id]/summary/route';

/**
 * Route-level wiring of the English follow-ups: a full summary/article
 * generation in a non-English language must also queue an English run,
 * handing the follow-up the right source language. The follow-up's own
 * skip rules are covered by englishSummaryFollowUp / englishArticleFollowUp.
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

const USER_ID = 'english_follow_up_routes_user';
jest.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: USER_ID }),
}));

// Each start() gets its own run id; every run reports as running with
// an already-closed stream, enough for the routes to respond.
const mockStart = jest.fn();
jest.mock('workflow/api', () => ({
  start: (...args: unknown[]) => mockStart(...args),
  getRun: (runId: string) => ({
    runId,
    status: Promise.resolve('running'),
    getReadable: () =>
      new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
  }),
}));

// The routes hand the follow-up to waitUntil; collect it so the test
// can await it like the platform would.
const mockPending: Promise<unknown>[] = [];
jest.mock('@vercel/functions', () => ({
  waitUntil: (promise: Promise<unknown>) => {
    mockPending.push(promise);
  },
}));

// franc / iso-639-3 are ESM-only; same stand-ins as languageCache.test.ts.
// Transcripts here carry a cached language, so detection never runs.
jest.mock('franc', () => ({ __esModule: true, franc: () => 'eng' }));
jest.mock('iso-639-3', () => ({ __esModule: true, iso6393To1: { eng: 'en' } }));

async function seed(transcriptLanguage: string): Promise<string> {
  await global.testPrisma.user.create({
    data: { source_id: USER_ID, name: 'Follow-up', email: 'english_follow_up@example.com' },
  });
  const channel = await global.testPrisma.channel.create({
    data: {
      source_id: 'english_follow_up_chan',
      name: 'Follow-up channel',
      rss_url: 'https://example.com/efu.xml',
    },
  });
  await global.testPrisma.userSubscription.create({
    data: { user_id: USER_ID, channel_id: channel.id },
  });
  const video = await global.testPrisma.video.create({
    data: {
      channel_id: channel.id,
      source_id: 'efu00000001',
      title: 'Follow-up video',
      published_at: new Date('2026-01-01T00:00:00Z'),
      duration_seconds: 600,
    },
  });
  await global.testPrisma.transcript.create({
    data: {
      video_id: video.id,
      text: JSON.stringify([{ startMs: 0, endMs: 1000, text: 'Placeholder transcript text.' }]),
      language: transcriptLanguage,
      fetched_at: new Date(),
    },
  });
  return video.id;
}

beforeEach(async () => {
  await global.testPrisma.userRequest.deleteMany();
  await global.testPrisma.summary.deleteMany();
  await global.testPrisma.article.deleteMany();
  await global.testPrisma.transcript.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
  mockPending.length = 0;
  mockStart.mockReset();
  let runCounter = 0;
  mockStart.mockImplementation(() => Promise.resolve({ runId: `run_${++runCounter}` }));
});

const ROUTES = [
  {
    name: 'summary POST',
    call: (id: string, language: string) =>
      summaryPost(new NextRequest(`http://test/api/videos/${id}/summary?language=${language}`), {
        params: Promise.resolve({ id }),
      }),
  },
  {
    name: 'article POST',
    call: (id: string, language: string) =>
      articlePost(
        new NextRequest(`http://test/api/videos/${id}/article?language=${language}`, {
          method: 'POST',
          body: JSON.stringify({ style: ArticleStyle.NARRATIVE }),
        }),
        { params: Promise.resolve({ id }) }
      ),
  },
];

const CASES = [
  {
    label: 'a non-English target',
    language: 'zh-Hans',
    transcriptLanguage: 'en',
    started: ['zh-Hans', 'en'],
  },
  {
    label: 'an Original of a non-English source',
    language: 'original',
    transcriptLanguage: 'zh',
    started: [null, 'en'],
  },
  {
    label: 'an Original of an English source',
    language: 'original',
    transcriptLanguage: 'en',
    started: [null],
  },
];

describe.each(ROUTES)('$name', ({ call }) => {
  it.each(CASES)(
    'queues the expected runs for $label',
    async ({ language, transcriptLanguage, started }) => {
      const videoId = await seed(transcriptLanguage);

      const res = await call(videoId, language);
      expect(res.status).toBe(200);
      await Promise.all(mockPending);

      const languages = mockStart.mock.calls.map(
        ([, [input]]) => (input as { language: string | null }).language
      );
      expect(languages).toEqual(started);
    }
  );
});
