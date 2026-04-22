import { ArticleStyle } from '@readtube/database';
import '@tests/integration-tests';

import { findOrCloneArticle, findOrCloneSummary } from '@/lib/language/cache';
import { resolveTargetLanguage } from '@/lib/language/resolve';

// franc / iso-639-3 are ESM and ts-jest can't transform them. Mock with a
// deterministic regex-based detector so the cache helpers' control flow
// is what we're actually exercising. Real franc behavior is covered by
// the unit tests + lived-in dogfooding; here we lock in the
// SQL-shaped invariants (clone vs generate, partial unique index
// enforcement, transcript.language stamping).

jest.mock('franc', () => ({
  __esModule: true,
  franc: jest.fn((text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return 'und';
    }
    if (/[一-鿿]/.test(trimmed)) {
      return 'cmn';
    }
    if (/[぀-ヿ]/.test(trimmed)) {
      return 'jpn';
    }
    if (/^[a-zA-Z\s.,!?'"-]+$/.test(trimmed)) {
      return 'eng';
    }
    return 'und';
  }),
}));

jest.mock('iso-639-3', () => ({
  __esModule: true,
  iso6393To1: { eng: 'en', cmn: 'zh', jpn: 'ja' },
}));

const ZH_HANS = 'zh-Hans';
const ZH_HANT = 'zh-Hant';

const ENGLISH_TEXT =
  'The quick brown fox jumps over the lazy dog. This sentence is in English and franc should detect it as eng.';
const CHINESE_TEXT = '今天天气真不错,我们一起去公园散步吧。这是一段中文文本。';

interface SeedResult {
  userId: string;
  channelId: string;
  videoId: string;
  transcriptId: string;
}

let seedCounter = 0;

async function seed(
  transcriptText: string,
  transcriptLanguage: string | null
): Promise<SeedResult> {
  // Each call gets a unique id namespace so tests in the same file don't
  // collide on FKs after `beforeEach` cleans the slate.
  seedCounter++;
  const tag = `lang${seedCounter}`;

  await global.testPrisma.user.create({
    data: {
      source_id: `${tag}-user`,
      name: 'Test',
      email: `${tag}@example.com`,
    },
  });

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
      text: transcriptText,
      language: transcriptLanguage,
      fetched_at: new Date('2026-01-01T00:00:00Z'),
    },
  });

  return {
    userId: `${tag}-user`,
    channelId: channel.id,
    videoId: video.id,
    transcriptId: transcript.id,
  };
}

async function seedSummary(transcriptId: string, language: string | null, headline = 'Hello') {
  return global.testPrisma.summary.create({
    data: {
      transcript_id: transcriptId,
      language,
      headline,
      short: 'Short body.',
      full: 'Full body.',
      prompt_version: 'v1',
      model: 'test-model',
    },
  });
}

async function seedArticle(
  transcriptId: string,
  style: ArticleStyle,
  language: string | null,
  content = 'Article body.'
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

beforeEach(async () => {
  // Order matters: child tables before parents, FK cascades cover most
  // but explicit deletes keep the cleanup obvious.
  await global.testPrisma.summary.deleteMany();
  await global.testPrisma.article.deleteMany();
  await global.testPrisma.transcript.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
});

describe('Summary partial unique indexes', () => {
  it('rejects two Original (language IS NULL) rows for the same transcript', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    await seedSummary(transcriptId, null);
    await expect(seedSummary(transcriptId, null)).rejects.toThrow();
  });

  it('rejects two rows with the same non-null language for the same transcript', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    await seedSummary(transcriptId, 'en');
    await expect(seedSummary(transcriptId, 'en')).rejects.toThrow();
  });

  it('allows Original AND a non-null language to coexist for the same transcript', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    await seedSummary(transcriptId, null);
    await seedSummary(transcriptId, 'en');
    const rows = await global.testPrisma.summary.findMany({
      where: { transcript_id: transcriptId },
    });
    expect(rows).toHaveLength(2);
  });

  it('allows different non-null languages to coexist for the same transcript', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    await seedSummary(transcriptId, 'en');
    await seedSummary(transcriptId, 'zh');
    await seedSummary(transcriptId, 'ja');
    const rows = await global.testPrisma.summary.findMany({
      where: { transcript_id: transcriptId },
    });
    expect(rows).toHaveLength(3);
  });

  it('allows null-language rows across different transcripts', async () => {
    const a = await seed(ENGLISH_TEXT, 'en');
    const b = await seed(CHINESE_TEXT, 'zh');
    await seedSummary(a.transcriptId, null);
    await seedSummary(b.transcriptId, null);
    const rows = await global.testPrisma.summary.findMany({ where: { language: null } });
    expect(rows).toHaveLength(2);
  });
});

describe('Article partial unique indexes', () => {
  it('rejects two Original NARRATIVE rows for the same transcript', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    await seedArticle(transcriptId, ArticleStyle.NARRATIVE, null);
    await expect(seedArticle(transcriptId, ArticleStyle.NARRATIVE, null)).rejects.toThrow();
  });

  it('allows Original NARRATIVE AND Original DIALOG to coexist (different style)', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    await seedArticle(transcriptId, ArticleStyle.NARRATIVE, null);
    await seedArticle(transcriptId, ArticleStyle.DIALOG, null);
    const rows = await global.testPrisma.article.findMany({
      where: { transcript_id: transcriptId },
    });
    expect(rows).toHaveLength(2);
  });

  it('allows Original AND non-null language for the same (transcript, style)', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    await seedArticle(transcriptId, ArticleStyle.NARRATIVE, null);
    await seedArticle(transcriptId, ArticleStyle.NARRATIVE, 'en');
    const rows = await global.testPrisma.article.findMany({
      where: { transcript_id: transcriptId, style: ArticleStyle.NARRATIVE },
    });
    expect(rows).toHaveLength(2);
  });
});

describe('findOrCloneSummary', () => {
  it('returns null when no Summary row exists for the transcript', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    expect(await findOrCloneSummary(global.testPrisma, transcriptId, null)).toBeNull();
    expect(await findOrCloneSummary(global.testPrisma, transcriptId, 'en')).toBeNull();
  });

  it('returns the Original row when target=null', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    await seedSummary(transcriptId, null, 'Original headline');

    const result = await findOrCloneSummary(global.testPrisma, transcriptId, null);
    expect(result?.headline).toBe('Original headline');
    expect(result?.language).toBeNull();
  });

  it('returns null for target=null when only translated rows exist', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    await seedSummary(transcriptId, 'en');
    expect(await findOrCloneSummary(global.testPrisma, transcriptId, null)).toBeNull();
  });

  it('returns the cached target row directly when (transcript, target) exists', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    await seedSummary(transcriptId, null, 'Original');
    await seedSummary(transcriptId, 'en', 'English target');

    const result = await findOrCloneSummary(global.testPrisma, transcriptId, 'en');
    expect(result?.headline).toBe('English target');
    expect(result?.language).toBe('en');
  });

  it('clones the Original when target matches transcript.language', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    const original = await seedSummary(transcriptId, null, 'Original');

    const result = await findOrCloneSummary(global.testPrisma, transcriptId, 'en');

    expect(result?.id).not.toBe(original.id);
    expect(result?.language).toBe('en');
    expect(result?.headline).toBe('Original');
    expect(result?.short).toBe(original.short);
    expect(result?.full).toBe(original.full);

    // Original survives untouched.
    const stillOriginal = await global.testPrisma.summary.findFirst({
      where: { transcript_id: transcriptId, language: null },
    });
    expect(stillOriginal?.id).toBe(original.id);
    expect(stillOriginal?.headline).toBe('Original');
  });

  it('detects transcript.language when null and clones if matches target', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, null);
    await seedSummary(transcriptId, null, 'Detected English');

    const result = await findOrCloneSummary(global.testPrisma, transcriptId, 'en');

    expect(result?.language).toBe('en');
    expect(result?.headline).toBe('Detected English');

    // transcript.language is now stamped so future lookups skip detection.
    const transcript = await global.testPrisma.transcript.findUnique({
      where: { id: transcriptId },
    });
    expect(transcript?.language).toBe('en');
  });

  it('returns null when target does not match transcript.language (caller should generate)', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    await seedSummary(transcriptId, null);

    expect(await findOrCloneSummary(global.testPrisma, transcriptId, 'zh')).toBeNull();

    // Original row is unchanged — no stamp on a non-matching path.
    const original = await global.testPrisma.summary.findFirst({
      where: { transcript_id: transcriptId, language: null },
    });
    expect(original).not.toBeNull();
  });

  it('returns null when target is non-null and no Original exists to clone from', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    expect(await findOrCloneSummary(global.testPrisma, transcriptId, 'en')).toBeNull();
  });

  it.each([
    { label: 'Simplified script tag', stored: 'zh-Hans', target: ZH_HANS },
    { label: 'Mainland region (resolves to Simplified)', stored: 'zh-CN', target: ZH_HANS },
    { label: 'Singapore region (resolves to Simplified)', stored: 'zh-SG', target: ZH_HANS },
    { label: 'Traditional script tag', stored: 'zh-Hant', target: ZH_HANT },
    { label: 'Taiwan region (resolves to Traditional)', stored: 'zh-TW', target: ZH_HANT },
    { label: 'Hong Kong region (resolves to Traditional)', stored: 'zh-HK', target: ZH_HANT },
  ])(
    'clones when transcript.language $label ($stored) matches picker target $target',
    async ({ stored, target }) => {
      const { transcriptId } = await seed(CHINESE_TEXT, stored);
      const original = await seedSummary(transcriptId, null, 'Original Chinese');

      const result = await findOrCloneSummary(global.testPrisma, transcriptId, target);

      expect(result).not.toBeNull();
      expect(result?.language).toBe(target);
      expect(result?.id).not.toBe(original.id);
    }
  );

  it('does not cross-clone Simplified vs Traditional when both scripts are explicit', async () => {
    const { transcriptId } = await seed(CHINESE_TEXT, 'zh-Hans');
    await seedSummary(transcriptId, null, 'Simplified Original');

    // Picker target is Traditional but the stored content is Simplified
    // — the cache should NOT clone, the caller should generate fresh
    // Traditional content.
    expect(await findOrCloneSummary(global.testPrisma, transcriptId, ZH_HANT)).toBeNull();
  });

  it('clones for either Chinese script when transcript.language is ambiguous "zh"', async () => {
    // Bare "zh" carries no script signal — accept either picker target.
    // This is the legacy case for old transcripts and for franc results
    // (cmn → zh) where script can't be inferred from text alone.
    const a = await seed(CHINESE_TEXT, 'zh');
    await seedSummary(a.transcriptId, null, 'Ambiguous Chinese');
    expect(await findOrCloneSummary(global.testPrisma, a.transcriptId, ZH_HANS)).not.toBeNull();

    const b = await seed(CHINESE_TEXT, 'zh');
    await seedSummary(b.transcriptId, null, 'Ambiguous Chinese');
    expect(await findOrCloneSummary(global.testPrisma, b.transcriptId, ZH_HANT)).not.toBeNull();
  });
});

describe('findOrCloneArticle', () => {
  it('clones the Original NARRATIVE article into a target row', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    const original = await seedArticle(
      transcriptId,
      ArticleStyle.NARRATIVE,
      null,
      '# Original article'
    );

    const result = await findOrCloneArticle(
      global.testPrisma,
      transcriptId,
      ArticleStyle.NARRATIVE,
      'en'
    );

    expect(result?.id).not.toBe(original.id);
    expect(result?.style).toBe(ArticleStyle.NARRATIVE);
    expect(result?.language).toBe('en');
    expect(result?.content).toBe('# Original article');

    const stillOriginal = await global.testPrisma.article.findFirst({
      where: { transcript_id: transcriptId, style: ArticleStyle.NARRATIVE, language: null },
    });
    expect(stillOriginal?.id).toBe(original.id);
  });

  it('does not cross-pollinate styles when cloning', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    await seedArticle(transcriptId, ArticleStyle.NARRATIVE, null, 'Narrative original');
    // No DIALOG original exists — request for DIALOG returns null.
    expect(
      await findOrCloneArticle(global.testPrisma, transcriptId, ArticleStyle.DIALOG, 'en')
    ).toBeNull();
  });

  it('returns the cached target row directly when (transcript, style, target) exists', async () => {
    const { transcriptId } = await seed(ENGLISH_TEXT, 'en');
    await seedArticle(transcriptId, ArticleStyle.NARRATIVE, null, 'Original');
    await seedArticle(transcriptId, ArticleStyle.NARRATIVE, 'zh', 'Chinese cached');

    const result = await findOrCloneArticle(
      global.testPrisma,
      transcriptId,
      ArticleStyle.NARRATIVE,
      'zh'
    );
    expect(result?.content).toBe('Chinese cached');
  });
});

describe('resolveTargetLanguage', () => {
  async function seedUserWithPreference(preferred: string | null) {
    seedCounter++;
    const userId = `pref${seedCounter}`;
    await global.testPrisma.user.create({
      data: {
        source_id: userId,
        name: 'Test',
        email: `${userId}@example.com`,
        preferred_language: preferred,
      },
    });
    return userId;
  }

  it('uses the query parameter when target is provided and curated', async () => {
    const userId = await seedUserWithPreference('zh');
    expect(await resolveTargetLanguage(global.testPrisma, userId, 'en')).toBe('en');
  });

  it('returns null when query is "original" — bypasses user preference', async () => {
    const userId = await seedUserWithPreference('zh');
    expect(await resolveTargetLanguage(global.testPrisma, userId, 'original')).toBeNull();
  });

  it('falls through to user.preferred_language when query is missing', async () => {
    const userId = await seedUserWithPreference('zh');
    expect(await resolveTargetLanguage(global.testPrisma, userId, null)).toBe('zh');
  });

  it('falls through to preference when query is empty string', async () => {
    const userId = await seedUserWithPreference('zh');
    expect(await resolveTargetLanguage(global.testPrisma, userId, '')).toBe('zh');
  });

  it('falls through to preference when query is an unknown code (defense in depth)', async () => {
    const userId = await seedUserWithPreference('zh');
    expect(await resolveTargetLanguage(global.testPrisma, userId, 'foobar')).toBe('zh');
  });

  it('returns null when neither query nor preference is set', async () => {
    const userId = await seedUserWithPreference(null);
    expect(await resolveTargetLanguage(global.testPrisma, userId, null)).toBeNull();
  });

  it('returns null when the user row does not exist (auth edge)', async () => {
    expect(await resolveTargetLanguage(global.testPrisma, 'no-such-user', null)).toBeNull();
  });
});
