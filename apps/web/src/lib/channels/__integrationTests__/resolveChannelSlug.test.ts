import { VideoPlatformType } from '@readtube/database';
import '@tests/integration-tests';

import { resolveChannelSlug } from '@/lib/channels/resolveChannelSlug';

jest.mock('@readtube/database', () => {
  const actual = jest.requireActual('@readtube/database');
  const prismaProxy = new Proxy({} as any, {
    get(_target, prop: string) {
      return (global as any).testPrisma[prop];
    },
  });
  return { ...actual, prisma: prismaProxy };
});

beforeEach(async () => {
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
});

describe('resolveChannelSlug', () => {
  it('resolves a YouTube source_id slug', async () => {
    const ch = await global.testPrisma.channel.create({
      data: {
        source_type: VideoPlatformType.YOUTUBE,
        source_id: 'UC_yt',
        name: 'YT Channel',
        rss_url: 'https://example.com/yt.xml',
      },
    });
    const result = await resolveChannelSlug(global.testPrisma, 'UC_yt');
    expect(result?.id).toBe(ch.id);
  });

  it('resolves a Bilibili numeric mid slug', async () => {
    // Regression: previously resolveChannelSlug hardcoded
    // source_type=YOUTUBE, so /channels/946974 for a Bilibili row
    // would never match and the page would 404 right after add.
    const ch = await global.testPrisma.channel.create({
      data: {
        source_type: VideoPlatformType.BILIBILI,
        source_id: '946974',
        name: '影视飓风',
        rss_url: null,
      },
    });
    const result = await resolveChannelSlug(global.testPrisma, '946974');
    expect(result?.id).toBe(ch.id);
    expect(result?.source_type).toBe(VideoPlatformType.BILIBILI);
  });

  it('resolves a YouTube @handle slug', async () => {
    const ch = await global.testPrisma.channel.create({
      data: {
        source_type: VideoPlatformType.YOUTUBE,
        source_id: 'UC_mkbhd',
        name: 'MKBHD',
        handle: '@mkbhd',
        rss_url: 'https://example.com/mkbhd.xml',
      },
    });
    expect((await resolveChannelSlug(global.testPrisma, '@mkbhd'))?.id).toBe(ch.id);
  });

  it('resolves a handle stored without the leading @', async () => {
    const ch = await global.testPrisma.channel.create({
      data: {
        source_type: VideoPlatformType.YOUTUBE,
        source_id: 'UC_bare',
        name: 'Bare',
        handle: 'bare',
        rss_url: 'https://example.com/bare.xml',
      },
    });
    expect((await resolveChannelSlug(global.testPrisma, '@bare'))?.id).toBe(ch.id);
  });

  it('returns null when no channel matches the slug', async () => {
    expect(await resolveChannelSlug(global.testPrisma, 'UC_missing')).toBeNull();
    expect(await resolveChannelSlug(global.testPrisma, '@nobody')).toBeNull();
  });

  it('picks the Bilibili row when an all-digit slug collides with a YouTube row', async () => {
    // Worst case the data model permits: YOUTUBE + BILIBILI both with
    // source_id=946974 (the composite unique constraint is scoped by
    // source_type, so nothing at the DB layer prevents it). The slug
    // `946974` is Bilibili-shaped (all digits), so the shape-directed
    // lookup must pick the Bilibili row — not whichever Postgres
    // happens to return first from an unordered findFirst.
    await global.testPrisma.channel.create({
      data: {
        source_type: VideoPlatformType.YOUTUBE,
        source_id: '946974',
        name: 'YT collision',
        rss_url: 'https://example.com/yt.xml',
      },
    });
    const bili = await global.testPrisma.channel.create({
      data: {
        source_type: VideoPlatformType.BILIBILI,
        source_id: '946974',
        name: 'Bili collision',
        rss_url: null,
      },
    });

    const result = await resolveChannelSlug(global.testPrisma, '946974');
    expect(result?.id).toBe(bili.id);
    expect(result?.source_type).toBe(VideoPlatformType.BILIBILI);
  });
});
