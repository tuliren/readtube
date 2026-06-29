import '@tests/integration-tests';

import { loadInboxVideos } from '@/lib/inbox/loadVideos';

/**
 * Regression coverage for T-509. A standalone video added for a
 * subscribed channel whose watch-page scrape couldn't recover a publish
 * date lands with `published_at = null`. The channel list must order it
 * by its effective publish date — `COALESCE(published_at, created_at)` —
 * so a freshly added video appears near the top of page 1 instead of
 * being buried on the last page by a raw `published_at NULLS LAST` sort.
 */

const USER_ID = 'ordering_user';

async function reset() {
  await global.testPrisma.standaloneVideo.deleteMany();
  await global.testPrisma.userVideoConsumption.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
  await global.testPrisma.user.create({
    data: { source_id: USER_ID, name: 'Ordering', email: 'ordering@example.com' },
  });
}

beforeEach(reset);

describe('loadInboxVideos effective-date ordering', () => {
  it('places a recently added null-date video on page 1 above older dated videos', async () => {
    const channel = await global.testPrisma.channel.create({
      data: { source_id: 'UC_ord', name: 'Ordering Chan', rss_url: 'https://x/ord.xml' },
    });
    await global.testPrisma.userSubscription.create({
      data: { user_id: USER_ID, channel_id: channel.id },
    });

    // 30 crawled videos with real, descending publish dates — enough to
    // fill more than one page (PAGE_SIZE = 25). Their newest entry is
    // 2026-01-30; all are well before "now".
    const base = new Date('2026-01-01T00:00:00Z').getTime();
    const day = 24 * 60 * 60 * 1000;
    await global.testPrisma.video.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        channel_id: channel.id,
        source_id: `dated_${i}`,
        title: `Dated ${i}`,
        published_at: new Date(base + i * day),
      })),
    });

    // The "latest" video the user added manually. The scrape couldn't
    // find a publish date, so published_at is null; created_at defaults
    // to now (far newer than any dated video above).
    const standalone = await global.testPrisma.video.create({
      data: {
        channel_id: channel.id,
        source_id: 'standalone_null_date',
        title: 'Just added, no date',
        published_at: null,
      },
    });
    await global.testPrisma.standaloneVideo.create({
      data: { user_id: USER_ID, video_id: standalone.id },
    });

    const res = await loadInboxVideos(global.testPrisma, USER_ID, { channelId: channel.id });

    expect(res.total).toBe(31);
    // It must be on the first page...
    const ids = res.videos.map((v) => v.id);
    expect(ids).toContain(standalone.id);
    // ...and at the very top, since its effective date (created_at = now)
    // is newer than every dated video.
    expect(ids[0]).toBe(standalone.id);
  });

  it('keeps dated videos ordered newest-first', async () => {
    const channel = await global.testPrisma.channel.create({
      data: { source_id: 'UC_ord2', name: 'Ordering Chan 2', rss_url: 'https://x/ord2.xml' },
    });
    await global.testPrisma.userSubscription.create({
      data: { user_id: USER_ID, channel_id: channel.id },
    });
    const base = new Date('2026-01-01T00:00:00Z').getTime();
    const hour = 60 * 60 * 1000;
    const newest = await global.testPrisma.video.create({
      data: {
        channel_id: channel.id,
        source_id: 'newest',
        title: 'Newest',
        published_at: new Date(base + 2 * hour),
      },
    });
    const middle = await global.testPrisma.video.create({
      data: {
        channel_id: channel.id,
        source_id: 'middle',
        title: 'Middle',
        published_at: new Date(base + hour),
      },
    });
    const oldest = await global.testPrisma.video.create({
      data: {
        channel_id: channel.id,
        source_id: 'oldest',
        title: 'Oldest',
        published_at: new Date(base),
      },
    });

    const desc = await loadInboxVideos(global.testPrisma, USER_ID, { channelId: channel.id });
    expect(desc.videos.map((v) => v.id)).toEqual([newest.id, middle.id, oldest.id]);

    const asc = await loadInboxVideos(global.testPrisma, USER_ID, {
      channelId: channel.id,
      sort: 'oldest',
    });
    expect(asc.videos.map((v) => v.id)).toEqual([oldest.id, middle.id, newest.id]);
  });

  it('paginates against the effective-date order without dropping rows', async () => {
    const channel = await global.testPrisma.channel.create({
      data: { source_id: 'UC_ord3', name: 'Ordering Chan 3', rss_url: 'https://x/ord3.xml' },
    });
    await global.testPrisma.userSubscription.create({
      data: { user_id: USER_ID, channel_id: channel.id },
    });
    const base = new Date('2026-01-01T00:00:00Z').getTime();
    const day = 24 * 60 * 60 * 1000;
    await global.testPrisma.video.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        channel_id: channel.id,
        source_id: `v_${i}`,
        title: `V ${i}`,
        published_at: new Date(base + i * day),
      })),
    });

    const page1 = await loadInboxVideos(global.testPrisma, USER_ID, { channelId: channel.id });
    const page2 = await loadInboxVideos(global.testPrisma, USER_ID, {
      channelId: channel.id,
      page: 2,
    });

    expect(page1.videos).toHaveLength(25);
    expect(page2.videos).toHaveLength(5);
    // No overlap between pages and 30 distinct videos total.
    const union = new Set([...page1.videos.map((v) => v.id), ...page2.videos.map((v) => v.id)]);
    expect(union.size).toBe(30);
  });
});
