import { ArticleStyle, GenerationStatus } from '@readtube/database';
import '@tests/integration-tests';

import { loadPublicContentMeta } from '@/lib/videos/loadPublicContentMeta';

const T1 = new Date('2026-01-01T00:00:00.000Z');
const T2 = new Date('2026-02-01T00:00:00.000Z');
const T3 = new Date('2026-03-01T00:00:00.000Z');

interface Row {
  language: string | null;
  generatedAt: Date;
  status?: GenerationStatus;
}

async function seed(opts: {
  transcriptLanguage?: string | null;
  summaries?: Row[];
  articles?: Row[];
}): Promise<{ id: string; language: string | null }> {
  const channel = await global.testPrisma.channel.create({
    data: {
      source_id: 'meta_ch',
      source_type: 'YOUTUBE',
      name: 'Channel',
      rss_url: 'https://example.com/meta_ch.xml',
    },
  });
  const video = await global.testPrisma.video.create({
    data: { channel_id: channel.id, source_id: 'meta_v', source_type: 'YOUTUBE', title: 'Video' },
  });
  const transcript = await global.testPrisma.transcript.create({
    data: {
      video_id: video.id,
      text: 'transcript text',
      language: opts.transcriptLanguage ?? null,
      fetched_at: T1,
    },
  });
  for (const row of opts.summaries ?? []) {
    await global.testPrisma.summary.create({
      data: {
        transcript_id: transcript.id,
        language: row.language,
        status: row.status ?? GenerationStatus.READY,
        headline: 'Headline',
        short: `**Short** ${row.language ?? 'original'}`,
        full: 'Full',
        prompt_version: 'v1',
        model: 'test-model',
        generated_at: row.generatedAt,
      },
    });
  }
  for (const row of opts.articles ?? []) {
    await global.testPrisma.article.create({
      data: {
        transcript_id: transcript.id,
        style: ArticleStyle.NARRATIVE,
        language: row.language,
        status: row.status ?? GenerationStatus.READY,
        content: 'Article body',
        prompt_version: 'v1',
        model: 'test-model',
        generated_at: row.generatedAt,
      },
    });
  }
  return { id: transcript.id, language: transcript.language };
}

beforeEach(async () => {
  await global.testPrisma.article.deleteMany();
  await global.testPrisma.summary.deleteMany();
  await global.testPrisma.transcript.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
});

describe('loadPublicContentMeta', () => {
  it.each<{
    name: string;
    requested: string | null | undefined;
    seed: Parameters<typeof seed>[0];
    expected: Awaited<ReturnType<typeof loadPublicContentMeta>>;
  }>([
    {
      name: 'dates span the rendered summary and article',
      requested: undefined,
      seed: {
        summaries: [{ language: 'en', generatedAt: T1 }],
        articles: [{ language: 'en', generatedAt: T3 }],
      },
      expected: {
        datePublished: T1.toISOString(),
        dateModified: T3.toISOString(),
        language: 'en',
        description: 'Short en',
      },
    },
    {
      name: 'the default page reads English rows, not other translations',
      requested: undefined,
      seed: {
        transcriptLanguage: 'ja',
        summaries: [
          { language: null, generatedAt: T1 },
          { language: 'en', generatedAt: T2 },
        ],
      },
      expected: {
        datePublished: T2.toISOString(),
        dateModified: T2.toISOString(),
        language: 'en',
        description: 'Short en',
      },
    },
    {
      name: 'the Original takes the transcript language',
      requested: null,
      seed: {
        transcriptLanguage: 'ja',
        summaries: [
          { language: null, generatedAt: T1 },
          { language: 'en', generatedAt: T2 },
        ],
      },
      expected: {
        datePublished: T1.toISOString(),
        dateModified: T1.toISOString(),
        language: 'ja',
        description: 'Short original',
      },
    },
    {
      name: 'in-flight rows are ignored',
      requested: undefined,
      seed: {
        summaries: [{ language: 'en', generatedAt: T1 }],
        articles: [{ language: 'en', generatedAt: T3, status: GenerationStatus.GENERATING }],
      },
      expected: {
        datePublished: T1.toISOString(),
        dateModified: T1.toISOString(),
        language: 'en',
        description: 'Short en',
      },
    },
    {
      name: 'an article-only page has no description',
      requested: undefined,
      seed: { articles: [{ language: 'en', generatedAt: T2 }] },
      expected: {
        datePublished: T2.toISOString(),
        dateModified: T2.toISOString(),
        language: 'en',
        description: null,
      },
    },
    {
      name: 'only in-flight rows gives empty meta',
      requested: undefined,
      seed: {
        summaries: [{ language: 'en', generatedAt: T1, status: GenerationStatus.GENERATING }],
      },
      expected: { datePublished: null, dateModified: null, language: null, description: null },
    },
  ])('$name', async ({ requested, seed: seedOpts, expected }) => {
    const transcript = await seed(seedOpts);
    expect(await loadPublicContentMeta(global.testPrisma, transcript, requested)).toEqual(expected);
  });
});
