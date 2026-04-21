import '@tests/integration-tests';

import { upsertChannelWithVideos } from '@/lib/channels/upsertChannelWithVideos';
import { BilibiliPlatform, YouTubePlatform } from '@/lib/platforms';
import type { ChannelSnapshot } from '@/lib/platforms/types';

const youtube = new YouTubePlatform();
const bilibili = new BilibiliPlatform();

// ─── Module mocks ────────────────────────────────────────────────

jest.mock('@readtube/database', () => {
  const actual = jest.requireActual('@readtube/database');
  const prismaProxy = new Proxy({} as any, {
    get(_target, prop: string) {
      return (global as any).testPrisma[prop];
    },
  });
  return { ...actual, prisma: prismaProxy };
});

// ─── Helpers ─────────────────────────────────────────────────────

function snapshot(overrides: Partial<ChannelSnapshot> = {}): ChannelSnapshot {
  return {
    channelId: 'UC_default',
    name: 'Default Channel',
    handle: '@default',
    logoUrl: null,
    videos: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await global.testPrisma.playlistVideo.deleteMany();
  await global.testPrisma.playlist.deleteMany();
  await global.testPrisma.standaloneVideo.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
});

// ─── Tests ───────────────────────────────────────────────────────

describe('upsertChannelWithVideos', () => {
  it('does not throw when the channel already exists with the correct handle (cross-user add)', async () => {
    // Simulates: user A subscribed to channel X earlier, creating the
    // Channel row with source_id=UC_x and handle=@x. User B now tries
    // to subscribe to the same channel. Prisma.upsert would have
    // failed here because the INSERT violates the handle constraint
    // and Postgres can raise that instead of the ON CONFLICT target.
    await global.testPrisma.channel.create({
      data: {
        source_id: 'UC_x',
        name: 'Existing',
        rss_url: 'https://example.com/x.xml',
        handle: '@x',
      },
    });

    const ch = await upsertChannelWithVideos(
      global.testPrisma,
      youtube,
      'UC_x',
      snapshot({ channelId: 'UC_x', name: 'Refreshed', handle: '@x' })
    );

    expect(ch.source_id).toBe('UC_x');
    expect(ch.handle).toBe('@x');
    // Still exactly one Channel row.
    expect(await global.testPrisma.channel.count()).toBe(1);
  });

  it('creates a new channel with the scraped handle when no conflict', async () => {
    const ch = await upsertChannelWithVideos(
      global.testPrisma,
      youtube,
      'UC_new',
      snapshot({ channelId: 'UC_new', name: 'New', handle: '@new' })
    );
    expect(ch.source_id).toBe('UC_new');
    expect(ch.handle).toBe('@new');
  });

  it('updates logo/handle on an existing row when no conflict', async () => {
    await global.testPrisma.channel.create({
      data: {
        source_id: 'UC_x',
        name: 'Stale Name',
        rss_url: 'https://example.com/x.xml',
      },
    });

    const ch = await upsertChannelWithVideos(
      global.testPrisma,
      youtube,
      'UC_x',
      snapshot({ channelId: 'UC_x', name: 'Scraped', handle: '@x', logoUrl: 'https://logo/x' })
    );
    expect(ch.handle).toBe('@x');
    expect(ch.logo_url).toBe('https://logo/x');
  });

  it('does NOT set the handle when another channel already owns it (create path)', async () => {
    // Channel A pre-exists with handle @collide.
    await global.testPrisma.channel.create({
      data: {
        source_id: 'UC_a',
        name: 'A',
        rss_url: 'https://example.com/a.xml',
        handle: '@collide',
      },
    });

    // Scraping a *different* channel also returns handle @collide
    // (stale or renamed upstream). Upserting should not throw.
    const ch = await upsertChannelWithVideos(
      global.testPrisma,
      youtube,
      'UC_b',
      snapshot({ channelId: 'UC_b', name: 'B', handle: '@collide' })
    );
    expect(ch.source_id).toBe('UC_b');
    // Handle left null since @collide is owned by UC_a.
    expect(ch.handle).toBeNull();

    // The pre-existing channel's handle is untouched.
    const a = await global.testPrisma.channel.findUnique({
      where: {
        channel_unique_source: { source_type: 'YOUTUBE', source_id: 'UC_a' },
      },
    });
    expect(a?.handle).toBe('@collide');
  });

  it('does NOT update the handle when another channel owns it (update path)', async () => {
    // Shadow row for UC_b already exists with handle=null (e.g. from
    // an add-playlist ingest). UC_a owns @collide.
    await global.testPrisma.channel.create({
      data: {
        source_id: 'UC_a',
        name: 'A',
        rss_url: 'https://example.com/a.xml',
        handle: '@collide',
      },
    });
    await global.testPrisma.channel.create({
      data: {
        source_id: 'UC_b',
        name: 'Shadow B',
        rss_url: 'https://example.com/b.xml',
      },
    });

    const ch = await upsertChannelWithVideos(
      global.testPrisma,
      youtube,
      'UC_b',
      snapshot({
        channelId: 'UC_b',
        name: 'Real B',
        handle: '@collide',
        logoUrl: 'https://logo/b',
      })
    );
    // Handle stayed null (UC_a owns @collide); no P2002 thrown.
    expect(ch.handle).toBeNull();
    // Logo still got updated.
    expect(ch.logo_url).toBe('https://logo/b');
  });

  it('sets checked_at on the create path', async () => {
    const ch = await upsertChannelWithVideos(
      global.testPrisma,
      youtube,
      'UC_fresh',
      snapshot({ channelId: 'UC_fresh', name: 'F', handle: null })
    );
    expect(ch.checked_at).not.toBeNull();
    expect(ch.checked_at!.getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it('hydrates videos AND sets checked_at when updating a shadow row', async () => {
    // Shadow: created by add-video / add-playlist with no videos and
    // no checked_at. Simulates the user later adding the channel
    // explicitly — we want full hydration, not a metadata patch.
    await global.testPrisma.channel.create({
      data: {
        source_id: 'UC_shadow',
        name: 'Shadow',
        rss_url: 'https://example.com/shadow.xml',
      },
    });
    expect(
      await global.testPrisma.video.count({ where: { channel: { source_id: 'UC_shadow' } } })
    ).toBe(0);

    const ch = await upsertChannelWithVideos(
      global.testPrisma,
      youtube,
      'UC_shadow',
      snapshot({
        channelId: 'UC_shadow',
        name: 'Hydrated',
        handle: '@shadow',
        videos: [
          {
            videoId: 'vid_new',
            title: 'New',
            description: '',
            publishedAt: new Date('2026-01-01T00:00:00Z'),
            link: 'https://www.youtube.com/watch?v=vid_new',
            thumbnailUrl: 'https://thumb/new',
            durationSeconds: 60,
          },
        ],
      })
    );

    expect(ch.checked_at).not.toBeNull();
    expect(ch.name).toBe('Hydrated');

    const videos = await global.testPrisma.video.findMany({
      where: { channel: { source_id: 'UC_shadow' } },
    });
    expect(videos).toHaveLength(1);
    expect(videos[0]!.source_id).toBe('vid_new');
    expect(videos[0]!.source_type).toBe('YOUTUBE');
  });

  it('upserts existing videos on the update path (no duplicates)', async () => {
    // Channel + one existing video.
    const existing = await global.testPrisma.channel.create({
      data: {
        source_id: 'UC_reup',
        name: 'Stale Name',
        rss_url: 'https://example.com/reup.xml',
      },
    });
    await global.testPrisma.video.create({
      data: {
        channel_id: existing.id,
        source_type: 'YOUTUBE',
        source_id: 'vid_dup',
        title: 'Old Title',
        description: 'Old desc',
        published_at: new Date('2026-01-01T00:00:00Z'),
      },
    });

    await upsertChannelWithVideos(
      global.testPrisma,
      youtube,
      'UC_reup',
      snapshot({
        channelId: 'UC_reup',
        name: 'Fresh Name',
        handle: null,
        videos: [
          {
            videoId: 'vid_dup',
            title: 'New Title',
            description: '',
            publishedAt: new Date('2026-01-01T00:00:00Z'),
            link: 'https://www.youtube.com/watch?v=vid_dup',
            thumbnailUrl: 'https://thumb/dup',
            durationSeconds: null,
          },
          {
            videoId: 'vid_extra',
            title: 'Extra',
            description: '',
            publishedAt: new Date('2026-01-02T00:00:00Z'),
            link: 'https://www.youtube.com/watch?v=vid_extra',
            thumbnailUrl: 'https://thumb/extra',
            durationSeconds: 30,
          },
        ],
      })
    );

    const videos = await global.testPrisma.video.findMany({
      where: { channel: { source_id: 'UC_reup' } },
      orderBy: { source_id: 'asc' },
    });
    expect(videos).toHaveLength(2);
    const dup = videos.find((v) => v.source_id === 'vid_dup');
    expect(dup!.title).toBe('New Title');
    // Empty description in snapshot does NOT clobber the old one.
    expect(dup!.description).toBe('Old desc');
  });

  it('isScraped videos re-point channel_id even when title/description are preserved', async () => {
    // Shadow channel owns vid_collide. The user now subscribes to the
    // real channel; vid_collide is old enough to be scrape-only.
    // isScraped's no-op update branch must still re-point channel_id
    // so the video moves to the real owner.
    const shadow = await global.testPrisma.channel.create({
      data: {
        source_id: 'UC_shadow_scraped',
        name: 'Shadow',
        rss_url: 'https://example.com/shadow.xml',
      },
    });
    await global.testPrisma.video.create({
      data: {
        channel_id: shadow.id,
        source_type: 'YOUTUBE',
        source_id: 'vid_collide_scraped',
        title: 'Original Full Title',
        description: 'Original full description',
        published_at: new Date('2026-01-01T00:00:00Z'),
      },
    });

    const ch = await upsertChannelWithVideos(
      global.testPrisma,
      youtube,
      'UC_real_scraped',
      snapshot({
        channelId: 'UC_real_scraped',
        name: 'Real',
        handle: '@real_scraped',
        videos: [
          {
            videoId: 'vid_collide_scraped',
            title: 'Truncated...',
            description: 'snippet',
            publishedAt: new Date('2026-02-01T00:00:00Z'),
            link: 'https://www.youtube.com/watch?v=vid_collide_scraped',
            thumbnailUrl: 'https://thumb/cs',
            durationSeconds: 600,
            isScraped: true,
          },
        ],
      })
    );

    const moved = await global.testPrisma.video.findUnique({
      where: {
        video_unique_source: { source_type: 'YOUTUBE', source_id: 'vid_collide_scraped' },
      },
    });
    // Re-pointed to the new channel.
    expect(moved!.channel_id).toBe(ch.id);
    // But the original full title/description/publishedAt are preserved.
    expect(moved!.title).toBe('Original Full Title');
    expect(moved!.description).toBe('Original full description');
    expect(moved!.published_at).toEqual(new Date('2026-01-01T00:00:00Z'));
  });

  it('isScraped videos: creates new but does not overwrite an existing video row', async () => {
    // Channel + one existing video that originally had full RSS data.
    const existing = await global.testPrisma.channel.create({
      data: {
        source_id: 'UC_bf',
        name: 'BF Channel',
        rss_url: 'https://example.com/bf.xml',
      },
    });
    await global.testPrisma.video.create({
      data: {
        channel_id: existing.id,
        source_type: 'YOUTUBE',
        source_id: 'vid_full',
        title: 'Full RSS Title',
        description: 'Full RSS description',
        published_at: new Date('2026-01-01T00:00:00Z'),
      },
    });

    await upsertChannelWithVideos(
      global.testPrisma,
      youtube,
      'UC_bf',
      snapshot({
        channelId: 'UC_bf',
        name: 'BF',
        handle: null,
        videos: [
          // vid_full has rolled out of the RSS window — only scrape
          // sees it now, with truncated metadata.
          {
            videoId: 'vid_full',
            title: 'Truncated...',
            description: '',
            publishedAt: new Date('2026-01-15T00:00:00Z'),
            link: 'https://www.youtube.com/watch?v=vid_full',
            thumbnailUrl: 'https://thumb/full',
            durationSeconds: 600,
            isScraped: true,
          },
          // brand-new scrape-only video
          {
            videoId: 'vid_new_bf',
            title: 'Older Video',
            description: 'snippet',
            publishedAt: new Date('2025-12-01T00:00:00Z'),
            link: 'https://www.youtube.com/watch?v=vid_new_bf',
            thumbnailUrl: 'https://thumb/new_bf',
            durationSeconds: 800,
            isScraped: true,
          },
        ],
      })
    );

    const videos = await global.testPrisma.video.findMany({
      where: { channel: { source_id: 'UC_bf' } },
      orderBy: { source_id: 'asc' },
    });
    expect(videos.map((v) => v.source_id).sort()).toEqual(['vid_full', 'vid_new_bf']);

    // Existing row preserved — isScraped must NOT overwrite full data.
    const full = videos.find((v) => v.source_id === 'vid_full')!;
    expect(full.title).toBe('Full RSS Title');
    expect(full.description).toBe('Full RSS description');
    expect(full.published_at).toEqual(new Date('2026-01-01T00:00:00Z'));

    // New scrape-only row created with the truncated data.
    const created = videos.find((v) => v.source_id === 'vid_new_bf')!;
    expect(created.title).toBe('Older Video');
    expect(created.description).toBe('snippet');
    expect(created.duration_seconds).toBe(800);
  });

  it('create path: re-points a video that already lives under a shadow channel', async () => {
    // Shadow channel pre-existing from the add-playlist flow, with a
    // video that the upcoming channel-add snapshot also references. A
    // nested `videos: { create: [...] }` would crash with P2002 on the
    // `video_unique_source` constraint; the per-video upsert must
    // re-point `channel_id` to the real owner instead.
    const shadow = await global.testPrisma.channel.create({
      data: {
        source_id: 'UC_shadow_owner',
        name: 'Playlist Owner Shadow',
        rss_url: 'https://example.com/shadow.xml',
      },
    });
    await global.testPrisma.video.create({
      data: {
        channel_id: shadow.id,
        source_type: 'YOUTUBE',
        source_id: 'vid_collide',
        title: 'Originally under shadow',
        description: '',
        published_at: new Date('2026-01-01T00:00:00Z'),
      },
    });

    const ch = await upsertChannelWithVideos(
      global.testPrisma,
      youtube,
      'UC_real',
      snapshot({
        channelId: 'UC_real',
        name: 'Real Channel',
        handle: '@real',
        videos: [
          {
            videoId: 'vid_collide',
            title: 'Real Title',
            description: 'real desc',
            publishedAt: new Date('2026-01-15T00:00:00Z'),
            link: 'https://www.youtube.com/watch?v=vid_collide',
            thumbnailUrl: 'https://thumb/collide',
            durationSeconds: 500,
          },
        ],
      })
    );

    // The video was re-pointed to the new channel, not duplicated.
    const moved = await global.testPrisma.video.findUnique({
      where: {
        video_unique_source: { source_type: 'YOUTUBE', source_id: 'vid_collide' },
      },
    });
    expect(moved!.channel_id).toBe(ch.id);
    expect(moved!.title).toBe('Real Title');
    // Shadow channel still exists but no longer owns the video.
    const shadowVideos = await global.testPrisma.video.findMany({
      where: { channel_id: shadow.id },
    });
    expect(shadowVideos).toHaveLength(0);
  });

  it('creates initial Video rows from the snapshot', async () => {
    await upsertChannelWithVideos(
      global.testPrisma,
      youtube,
      'UC_v',
      snapshot({
        channelId: 'UC_v',
        name: 'V',
        handle: '@v',
        videos: [
          {
            videoId: 'vid1',
            title: 'Title 1',
            description: '',
            publishedAt: new Date('2026-01-01T00:00:00Z'),
            link: 'https://www.youtube.com/watch?v=vid1',
            thumbnailUrl: 'https://thumb/default',
            durationSeconds: null,
          },
          {
            videoId: 'vid2',
            title: 'Title 2',
            description: 'desc',
            publishedAt: new Date('2026-01-02T00:00:00Z'),
            link: 'https://www.youtube.com/watch?v=vid2',
            thumbnailUrl: 'https://thumb/default',
            durationSeconds: 300,
          },
        ],
      })
    );
    const videos = await global.testPrisma.video.findMany({
      where: { channel: { source_id: 'UC_v' } },
      orderBy: { source_id: 'asc' },
    });
    expect(videos.map((v: { source_id: string }) => v.source_id)).toEqual(['vid1', 'vid2']);
  });
});

describe('upsertChannelWithVideos — Bilibili', () => {
  function bilibiliSnapshot(overrides: Partial<ChannelSnapshot> = {}): ChannelSnapshot {
    return {
      channelId: '946974',
      name: '影视飓风',
      handle: null,
      logoUrl: 'http://i0.hdslb.com/bfs/face/xxx.jpg',
      videos: [],
      ...overrides,
    };
  }

  it('creates a Bilibili channel with source_type=BILIBILI and rss_url=null', async () => {
    const ch = await upsertChannelWithVideos(
      global.testPrisma,
      bilibili,
      '946974',
      bilibiliSnapshot()
    );

    expect(ch.source_id).toBe('946974');
    expect(ch.handle).toBeNull();
    expect(ch.rss_url).toBeNull();
    expect(ch.logo_url).toBe('http://i0.hdslb.com/bfs/face/xxx.jpg');

    // Confirm the row was actually stored as BILIBILI, not the schema
    // default of YOUTUBE (regression guard for the Devin-flagged
    // source_type-default bug).
    const row = await global.testPrisma.channel.findUnique({ where: { id: ch.id } });
    expect(row!.source_type).toBe('BILIBILI');
  });

  it('persists Bilibili videos with source_type=BILIBILI on the create path', async () => {
    await upsertChannelWithVideos(
      global.testPrisma,
      bilibili,
      '946974',
      bilibiliSnapshot({
        videos: [
          {
            videoId: 'BV1DgdhBGEq2',
            title: 'Pocket 4 上手',
            description: '',
            publishedAt: new Date('2026-04-16T12:00:00Z'),
            link: 'https://www.bilibili.com/video/BV1DgdhBGEq2/',
            thumbnailUrl: 'http://i0.hdslb.com/bfs/archive/a.jpg',
            durationSeconds: 1238,
          },
          {
            videoId: 'BV1NGZtBwELa',
            title: '4K Sample',
            description: 'desc',
            publishedAt: new Date('2026-02-18T03:00:00Z'),
            link: 'https://www.bilibili.com/video/BV1NGZtBwELa/',
            thumbnailUrl: 'http://i1.hdslb.com/bfs/archive/b.jpg',
            durationSeconds: 219,
          },
        ],
      })
    );

    const videos = await global.testPrisma.video.findMany({
      where: { channel: { source_id: '946974' } },
      orderBy: { source_id: 'asc' },
    });
    expect(videos).toHaveLength(2);
    for (const v of videos) {
      expect(v.source_type).toBe('BILIBILI');
    }
    // BV ids preserved verbatim.
    expect(videos.map((v: { source_id: string }) => v.source_id).sort()).toEqual(
      ['BV1DgdhBGEq2', 'BV1NGZtBwELa'].sort()
    );
  });

  it('hydrates a Bilibili shadow row (no videos, checked_at null)', async () => {
    // Shadow row: created by the add-video flow when a standalone
    // Bilibili video was saved. No videos, no checked_at.
    await global.testPrisma.channel.create({
      data: {
        source_type: 'BILIBILI',
        source_id: '946974',
        name: 'Shadow',
        rss_url: null,
      },
    });

    const ch = await upsertChannelWithVideos(
      global.testPrisma,
      bilibili,
      '946974',
      bilibiliSnapshot({
        name: 'Hydrated',
        videos: [
          {
            videoId: 'BV1hydrated',
            title: 'Now with videos',
            description: '',
            publishedAt: new Date('2026-04-19T00:00:00Z'),
            link: 'https://www.bilibili.com/video/BV1hydrated/',
            thumbnailUrl: 'http://i0.hdslb.com/bfs/archive/h.jpg',
            durationSeconds: 300,
          },
        ],
      })
    );

    expect(ch.name).toBe('Hydrated');
    expect(ch.checked_at).not.toBeNull();
    const videos = await global.testPrisma.video.findMany({
      where: { channel: { source_id: '946974' } },
    });
    expect(videos).toHaveLength(1);
    expect(videos[0]!.source_type).toBe('BILIBILI');
  });

  it('does not collide with a same-source_id YouTube row', async () => {
    // In practice UC ids and Bilibili mids have disjoint shapes, but
    // the (source_type, source_id) composite unique means we could
    // persist both. Verify the upsert scopes correctly.
    await global.testPrisma.channel.create({
      data: {
        source_type: 'YOUTUBE',
        source_id: '946974',
        name: 'YT 946974',
        rss_url: 'https://example.com/yt.xml',
      },
    });

    const ch = await upsertChannelWithVideos(
      global.testPrisma,
      bilibili,
      '946974',
      bilibiliSnapshot({ name: 'Bilibili 946974' })
    );

    expect(ch.name).toBe('Bilibili 946974');
    const rows = await global.testPrisma.channel.findMany({
      where: { source_id: '946974' },
      orderBy: { source_type: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { source_type: string }) => r.source_type).sort()).toEqual([
      'BILIBILI',
      'YOUTUBE',
    ]);
  });
});
