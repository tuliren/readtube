import { ArticleStyle } from '@readtube/database';
import '@tests/integration-tests';

import { loadVideoMarkdown } from '@/lib/markdown/loadVideoMarkdown';

/**
 * End-to-end coverage of the video markdown rendition against a real
 * Postgres: the 404 gate must match the public HTML page, and
 * `?language=` must resolve English-first exactly like the reader.
 */

// Shaped like a YouTube id so resolveVideoSourceId can infer the
// platform. Neutral placeholder, not a real video.
const SOURCE_ID = 'aaaaaaaaaa1';

beforeEach(async () => {
  await global.testPrisma.summary.deleteMany();
  await global.testPrisma.article.deleteMany();
  await global.testPrisma.transcript.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
});

async function seedVideo() {
  const channel = await global.testPrisma.channel.create({
    data: { source_id: 'UC_md_channel', name: 'Markdown channel', rss_url: 'https://x/md.xml' },
  });
  const video = await global.testPrisma.video.create({
    data: {
      channel_id: channel.id,
      source_id: SOURCE_ID,
      title: 'Markdown video',
      published_at: new Date('2026-01-02T00:00:00Z'),
    },
  });
  const transcript = await global.testPrisma.transcript.create({
    data: { video_id: video.id, text: 'Transcript text.', fetched_at: new Date() },
  });
  return transcript.id;
}

async function seedSummary(transcriptId: string, language: string | null, tag: string) {
  await global.testPrisma.summary.create({
    data: {
      transcript_id: transcriptId,
      language,
      headline: `Headline ${tag}`,
      short: `Short ${tag}`,
      full: `Full ${tag}`,
      prompt_version: 'v1',
      model: 'test-model',
    },
  });
}

async function seedArticle(transcriptId: string, language: string | null, tag: string) {
  await global.testPrisma.article.create({
    data: {
      transcript_id: transcriptId,
      style: ArticleStyle.NARRATIVE,
      language,
      content: `---\nversion: v1\n---\n## Section ${tag}\n\nBody ${tag}`,
      prompt_version: 'v1',
      model: 'test-model',
    },
  });
}

describe('loadVideoMarkdown', () => {
  it.each([
    ['an unknown id', SOURCE_ID],
    ['an id that matches no platform', 'not a video id'],
  ])('returns null for %s', async (_case, sourceId) => {
    expect(await loadVideoMarkdown(global.testPrisma, sourceId, null)).toBeNull();
  });

  it('returns null when the video has no READY summary or article', async () => {
    await seedVideo();
    expect(await loadVideoMarkdown(global.testPrisma, SOURCE_ID, null)).toBeNull();
  });

  it.each([
    ['no language', null, 'en', 'English'],
    ['an unknown language', 'xx', 'en', 'English'],
    ['a language with no rows', 'ja', 'en', 'English'],
    ['the Original', 'original', 'orig', 'Original (source language)'],
    ['a translation', 'zh-Hans', 'zh', 'Simplified Chinese'],
  ])('resolves %s English-first', async (_case, language, tag, languageName) => {
    const transcriptId = await seedVideo();
    for (const [lang, t] of [
      [null, 'orig'],
      ['en', 'en'],
      ['zh-Hans', 'zh'],
    ] as const) {
      await seedSummary(transcriptId, lang, t);
      await seedArticle(transcriptId, lang, t);
    }

    const markdown = await loadVideoMarkdown(global.testPrisma, SOURCE_ID, language);

    expect(markdown).not.toBeNull();
    expect(markdown).toContain('# Markdown video');
    expect(markdown).toContain('- Published: 2026-01-02');
    expect(markdown).toContain(`- Language: ${languageName}`);
    expect(markdown).toContain(`**Headline ${tag}**`);
    // Frontmatter is stripped and article headings nest under ## Article.
    expect(markdown).toContain(`## Article\n\n### Section ${tag}\n\nBody ${tag}`);
    expect(markdown).not.toContain('version: v1');
  });

  it.each([
    ['no language', null, `https://www.read.tube/p/videos/${SOURCE_ID}`],
    ['the Original', 'original', `https://www.read.tube/p/videos/${SOURCE_ID}?language=original`],
    ['a translation', 'zh-Hans', `https://www.read.tube/p/videos/${SOURCE_ID}?language=zh-Hans`],
  ])('links the reader page for %s', async (_case, language, readerUrl) => {
    const transcriptId = await seedVideo();
    await seedSummary(transcriptId, null, 'orig');

    const markdown = await loadVideoMarkdown(global.testPrisma, SOURCE_ID, language);

    expect(markdown).toContain(`- Read on ReadTube: ${readerUrl}\n`);
  });

  it('labels each section when the fallback serves them in different languages', async () => {
    const transcriptId = await seedVideo();
    await seedSummary(transcriptId, 'en', 'en');
    await seedArticle(transcriptId, 'zh-Hans', 'zh');

    const markdown = await loadVideoMarkdown(global.testPrisma, SOURCE_ID, null);

    expect(markdown).toContain(
      '- Summary language: English\n- Article language: Simplified Chinese'
    );
    expect(markdown).not.toContain('- Language:');
  });

  it('renders the article alone when there is no summary', async () => {
    const transcriptId = await seedVideo();
    await seedArticle(transcriptId, null, 'orig');

    const markdown = await loadVideoMarkdown(global.testPrisma, SOURCE_ID, null);

    expect(markdown).not.toContain('## Summary');
    expect(markdown).toContain('### Section orig');
  });
});
