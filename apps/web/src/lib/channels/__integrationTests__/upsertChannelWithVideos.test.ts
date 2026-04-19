import '@tests/integration-tests';

import { upsertChannelWithVideos } from '@/lib/channels/upsertChannelWithVideos';
import { YouTubePlatform } from '@/lib/platforms';
import type { ChannelSnapshot } from '@/lib/platforms/types';

const youtube = new YouTubePlatform();

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
