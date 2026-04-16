import '@tests/integration-tests';

import { upsertChannelWithVideos } from '@/lib/channels/upsertChannelWithVideos';
import type { ChannelSnapshot } from '@/lib/youtube/channelSnapshot';

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

  it('creates initial Video rows from the snapshot', async () => {
    await upsertChannelWithVideos(
      global.testPrisma,
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
