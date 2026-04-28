import { ArticleStyle } from '@readtube/database';
import '@tests/integration-tests';
import { NextRequest } from 'next/server';

import { GET as articleGet } from '@/app/api/public/videos/[id]/article/route';
import { GET as summaryGet } from '@/app/api/public/videos/[id]/summary/route';

// Route handlers import the `prisma` singleton from `@readtube/database`
// at module load — which happens before `beforeAll` instantiates
// `global.testPrisma` against the testcontainer URL. Wrap the module
// in a Proxy so each `prisma` property access resolves to the current
// testPrisma at call time. The variable name starts with `mock` to
// satisfy jest.mock's factory hoisting rule.
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

interface SeedResult {
  videoId: string;
  transcriptId: string;
}

let seedCounter = 0;

async function seedVideoWithTranscript(): Promise<SeedResult> {
  seedCounter++;
  const tag = `pub${seedCounter}`;

  const channel = await global.testPrisma.channel.create({
    data: {
      source_id: `${tag}-channel`,
      name: 'Test channel',
      rss_url: `https://example.com/${tag}.xml`,
    },
  });

  const video = await global.testPrisma.video.create({
    data: {
      channel_id: channel.id,
      source_id: `${tag}-video`,
      title: 'Test video',
      published_at: new Date('2026-01-01T00:00:00Z'),
    },
  });

  const transcript = await global.testPrisma.transcript.create({
    data: {
      video_id: video.id,
      text: 'Transcript text in English.',
      language: 'en',
      fetched_at: new Date('2026-01-01T00:00:00Z'),
    },
  });

  return { videoId: video.id, transcriptId: transcript.id };
}

async function seedSummary(transcriptId: string, language: string | null, headline: string) {
  return global.testPrisma.summary.create({
    data: {
      transcript_id: transcriptId,
      language,
      headline,
      short: `Short ${headline}`,
      full: `Full ${headline}`,
      prompt_version: 'v1',
      model: 'test-model',
    },
  });
}

async function seedArticle(
  transcriptId: string,
  style: ArticleStyle,
  language: string | null,
  content: string
) {
  return global.testPrisma.article.create({
    data: {
      transcript_id: transcriptId,
      style,
      language,
      content,
      prompt_version: 'v1',
      model: 'test-model',
    },
  });
}

function buildRequest(language?: string, style?: string): NextRequest {
  const params = new URLSearchParams();
  if (language != null) {
    params.set('language', language);
  }
  if (style != null) {
    params.set('style', style);
  }
  const url = `http://test/api/public/videos/x?${params.toString()}`;
  return new NextRequest(url);
}

beforeEach(async () => {
  await global.testPrisma.summary.deleteMany();
  await global.testPrisma.article.deleteMany();
  await global.testPrisma.transcript.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
});

describe('GET /api/public/videos/[id]/summary', () => {
  it('returns the requested translation when only translated summaries exist (no Original)', async () => {
    const { videoId, transcriptId } = await seedVideoWithTranscript();
    await seedSummary(transcriptId, 'zh-Hans', 'zh headline');
    await seedSummary(transcriptId, 'en', 'en headline');

    const res = await summaryGet(buildRequest('en'), { params: Promise.resolve({ id: videoId }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.headline).toBe('en headline');
    expect(body.language).toBe('en');
  });

  it('returns 200 for a non-Original translation request even with no Original row', async () => {
    const { videoId, transcriptId } = await seedVideoWithTranscript();
    await seedSummary(transcriptId, 'zh-Hans', 'zh headline');

    const res = await summaryGet(buildRequest('zh-Hans'), {
      params: Promise.resolve({ id: videoId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.headline).toBe('zh headline');
    expect(body.language).toBe('zh-Hans');
  });

  it('returns the Original when present and language=original is requested', async () => {
    const { videoId, transcriptId } = await seedVideoWithTranscript();
    await seedSummary(transcriptId, null, 'Original headline');
    await seedSummary(transcriptId, 'zh-Hans', 'zh headline');

    const res = await summaryGet(buildRequest('original'), {
      params: Promise.resolve({ id: videoId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.headline).toBe('Original headline');
    expect(body.language).toBeNull();
  });

  it('returns 404 when neither summary nor article exists', async () => {
    const { videoId } = await seedVideoWithTranscript();

    const res = await summaryGet(buildRequest('en'), { params: Promise.resolve({ id: videoId }) });

    expect(res.status).toBe(404);
  });

  it('returns 404 when the requested target is missing AND no Original exists', async () => {
    const { videoId, transcriptId } = await seedVideoWithTranscript();
    await seedSummary(transcriptId, 'zh-Hans', 'zh headline');

    const res = await summaryGet(buildRequest('ja'), { params: Promise.resolve({ id: videoId }) });

    // No `ja` row, no Original to fall back to.
    expect(res.status).toBe(404);
  });
});

describe('GET /api/public/videos/[id]/article', () => {
  it('returns the requested translation when only translated articles exist (no Original)', async () => {
    const { videoId, transcriptId } = await seedVideoWithTranscript();
    await seedArticle(transcriptId, ArticleStyle.NARRATIVE, 'zh-Hans', 'zh content');
    await seedArticle(transcriptId, ArticleStyle.NARRATIVE, 'en', 'en content');

    const res = await articleGet(buildRequest('en', ArticleStyle.NARRATIVE), {
      params: Promise.resolve({ id: videoId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBe('en content');
    expect(body.language).toBe('en');
  });

  it('passes the gate when only a translated summary exists (no article, no Original)', async () => {
    const { videoId, transcriptId } = await seedVideoWithTranscript();
    // The article gate also checks summaries; a translated summary
    // should be enough to flag the video as publicly shared.
    await seedSummary(transcriptId, 'zh-Hans', 'zh headline');
    await seedArticle(transcriptId, ArticleStyle.NARRATIVE, 'en', 'en content');

    const res = await articleGet(buildRequest('en', ArticleStyle.NARRATIVE), {
      params: Promise.resolve({ id: videoId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBe('en content');
  });

  it('returns 404 when neither summary nor article exists', async () => {
    const { videoId } = await seedVideoWithTranscript();

    const res = await articleGet(buildRequest('en', ArticleStyle.NARRATIVE), {
      params: Promise.resolve({ id: videoId }),
    });

    expect(res.status).toBe(404);
  });
});
