import '@tests/integration-tests';

import { FULL_WEBSITE_URL } from '@/constants';
import { buildVideoSitemapEntries, querySitemapVideos } from '@/lib/sitemap/publicVideoSitemap';

/**
 * End-to-end coverage of the sitemap pipeline: querySitemapVideos'
 * candidate filter + ordering against a real Postgres, then
 * buildVideoSitemapEntries' latest-transcript re-check that mirrors
 * the public page's 404 rule.
 *
 * Videos get explicit ids throughout: the query orders by `id DESC`
 * (cuid ids are timestamp-prefixed, so in production that means
 * newest-added-first), and hand-picked ids make that ordering
 * assertable without relying on cuid generation internals.
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
  id: string,
  sourceId: string,
  channelId: string,
  publishedAt: Date | null
) {
  return global.testPrisma.video.create({
    data: {
      id,
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
  it('includes only videos whose latest transcript has READY content, id-descending', async () => {
    const channel = await global.testPrisma.channel.create({
      data: { source_id: 'UC_sitemap', name: 'Sitemap Chan', rss_url: 'https://x/sitemap.xml' },
    });

    // Included: READY summary on the (only) transcript.
    const summarized = await createVideo(
      'vid_4',
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
    const articled = await createVideo(
      'vid_3',
      'articled',
      channel.id,
      new Date('2026-01-02T00:00:00Z')
    );
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

    // Included: a null published_at is irrelevant to the id ordering.
    const undated = await createVideo('vid_2', 'undated', channel.id, null);
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
    const refetched = await createVideo(
      'vid_5',
      'refetched',
      channel.id,
      new Date('2026-01-04T00:00:00Z')
    );
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
      'vid_1',
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
    await createVideo('vid_0', 'bare', channel.id, new Date('2026-01-01T00:00:00Z'));

    const rows = await querySitemapVideos(global.testPrisma);
    // id DESC across the candidates; the query keeps `refetched` (an
    // older transcript matches) but drops `generating` and `bare`
    // outright.
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

  it('orders by id descending regardless of insertion or publish order', async () => {
    const channel = await global.testPrisma.channel.create({
      data: { source_id: 'UC_order', name: 'Order Chan', rss_url: 'https://x/order.xml' },
    });
    // Created out of id order, with publish dates that contradict the
    // id order — the query must sort by id alone.
    for (const [id, sourceId, publishedAt] of [
      ['order_id_2', 'order_b', new Date('2026-03-01T00:00:00Z')],
      ['order_id_1', 'order_a', new Date('2026-01-01T00:00:00Z')],
      ['order_id_3', 'order_c', new Date('2026-02-01T00:00:00Z')],
    ] as const) {
      const video = await createVideo(id, sourceId, channel.id, publishedAt);
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
    expect(first.map((r) => r.source_id)).toEqual(['order_c', 'order_b', 'order_a']);
  });
});
