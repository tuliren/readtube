import '@tests/integration-tests';

import { FULL_WEBSITE_URL } from '@/constants';
import { buildVideoSitemapEntries, querySitemapVideos } from '@/lib/sitemap/publicVideoSitemap';

/**
 * End-to-end coverage of the sitemap pipeline: querySitemapVideos'
 * candidate filter + ordering against a real Postgres, then
 * buildVideoSitemapEntries' latest-transcript re-check that mirrors
 * the public page's 404 rule.
 */

async function reset() {
  await global.testPrisma.summary.deleteMany();
  await global.testPrisma.article.deleteMany();
  await global.testPrisma.transcript.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
}

beforeEach(reset);

async function createVideo(
  sourceId: string,
  channelId: string,
  publishedAt: Date | null,
  id?: string
) {
  return global.testPrisma.video.create({
    data: {
      ...(id != null ? { id } : {}),
      channel_id: channelId,
      source_id: sourceId,
      title: `Video ${sourceId}`,
      published_at: publishedAt,
    },
  });
}

async function createTranscript(videoId: string, createdAt: Date) {
  return global.testPrisma.transcript.create({
    data: {
      video_id: videoId,
      text: 'transcript text',
      fetched_at: createdAt,
      created_at: createdAt,
    },
  });
}

describe('sitemap video entries', () => {
  it('includes only videos whose latest transcript has READY content, newest first', async () => {
    const channel = await global.testPrisma.channel.create({
      data: { source_id: 'UC_sitemap', name: 'Sitemap Chan', rss_url: 'https://x/sitemap.xml' },
    });

    // Included: READY summary on the (only) transcript.
    const summarized = await createVideo(
      'summarized',
      channel.id,
      new Date('2026-01-03T00:00:00Z')
    );
    const summarizedTranscript = await createTranscript(
      summarized.id,
      new Date('2026-01-03T01:00:00Z')
    );
    await global.testPrisma.summary.create({
      data: {
        transcript_id: summarizedTranscript.id,
        status: 'READY',
        prompt_version: 'v1',
        model: 'test',
        generated_at: new Date('2026-01-05T00:00:00Z'),
      },
    });

    // Included: READY article only (no summary).
    const articled = await createVideo('articled', channel.id, new Date('2026-01-02T00:00:00Z'));
    const articledTranscript = await createTranscript(
      articled.id,
      new Date('2026-01-02T01:00:00Z')
    );
    await global.testPrisma.article.create({
      data: {
        transcript_id: articledTranscript.id,
        style: 'NARRATIVE',
        status: 'READY',
        prompt_version: 'v1',
        model: 'test',
        content: 'article body',
        generated_at: new Date('2026-01-06T00:00:00Z'),
      },
    });

    // Included, sorted last despite being the newest row: null
    // published_at sorts after every dated video.
    const undated = await createVideo('undated', channel.id, null);
    const undatedTranscript = await createTranscript(undated.id, new Date('2026-01-07T00:00:00Z'));
    await global.testPrisma.summary.create({
      data: {
        transcript_id: undatedTranscript.id,
        status: 'READY',
        prompt_version: 'v1',
        model: 'test',
        generated_at: new Date('2026-01-07T00:00:00Z'),
      },
    });

    // Excluded even though an older transcript has a READY summary:
    // the public page only reads the latest transcript, which has
    // nothing. The candidate query still returns it (`some` matches
    // the older transcript); the build step must drop it.
    const refetched = await createVideo('refetched', channel.id, new Date('2026-01-04T00:00:00Z'));
    const refetchedOld = await createTranscript(refetched.id, new Date('2026-01-04T01:00:00Z'));
    await global.testPrisma.summary.create({
      data: {
        transcript_id: refetchedOld.id,
        status: 'READY',
        prompt_version: 'v1',
        model: 'test',
      },
    });
    await createTranscript(refetched.id, new Date('2026-01-04T02:00:00Z'));

    // Excluded: only a GENERATING (in-flight) summary.
    const generating = await createVideo(
      'generating',
      channel.id,
      new Date('2026-01-01T00:00:00Z')
    );
    const generatingTranscript = await createTranscript(
      generating.id,
      new Date('2026-01-01T01:00:00Z')
    );
    await global.testPrisma.summary.create({
      data: {
        transcript_id: generatingTranscript.id,
        status: 'GENERATING',
        prompt_version: 'v1',
        model: 'test',
      },
    });

    // Excluded: no transcript at all.
    await createVideo('bare', channel.id, new Date('2026-01-01T00:00:00Z'));

    const rows = await querySitemapVideos(global.testPrisma);
    // The candidate query keeps `refetched` (an older transcript
    // matches) but drops `generating` and `bare` outright.
    expect(rows.map((r) => r.source_id)).toEqual([
      'refetched',
      'summarized',
      'articled',
      'undated',
    ]);

    const entries = buildVideoSitemapEntries(rows);
    expect(entries).toEqual([
      {
        url: `${FULL_WEBSITE_URL}/p/videos/summarized`,
        lastModified: new Date('2026-01-05T00:00:00Z'),
      },
      {
        url: `${FULL_WEBSITE_URL}/p/videos/articled`,
        lastModified: new Date('2026-01-06T00:00:00Z'),
      },
      {
        url: `${FULL_WEBSITE_URL}/p/videos/undated`,
        lastModified: new Date('2026-01-07T00:00:00Z'),
      },
    ]);
  });

  it('breaks published_at ties by id for a deterministic order', async () => {
    const channel = await global.testPrisma.channel.create({
      data: { source_id: 'UC_ties', name: 'Ties Chan', rss_url: 'https://x/ties.xml' },
    });
    const publishedAt = new Date('2026-01-01T00:00:00Z');
    // Created out of id order on purpose — the query must sort by id,
    // not by insertion order.
    for (const [id, sourceId] of [
      ['tie_id_2', 'tie_b'],
      ['tie_id_1', 'tie_a'],
      ['tie_id_3', 'tie_c'],
    ]) {
      const video = await createVideo(sourceId, channel.id, publishedAt, id);
      const transcript = await createTranscript(video.id, publishedAt);
      await global.testPrisma.summary.create({
        data: {
          transcript_id: transcript.id,
          status: 'READY',
          prompt_version: 'v1',
          model: 'test',
        },
      });
    }

    const first = await querySitemapVideos(global.testPrisma);
    const second = await querySitemapVideos(global.testPrisma);
    expect(second).toEqual(first);
    expect(first.map((r) => r.source_id)).toEqual(['tie_a', 'tie_b', 'tie_c']);
  });
});
