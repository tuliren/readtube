import '@tests/integration-tests';

import { buildVideoWhere } from '@/lib/inbox/buildWhere';

/**
 * End-to-end coverage for the filter composition path introduced by
 * PR #5 (buildVideoWhere) and consumed by PR #9 (/api/videos with
 * InboxQuery params). We seed a user with one channel and four videos
 * in distinct triage states, then assert that each filter combination
 * returns the expected subset when the built where clause is handed
 * directly to prisma.video.findMany.
 *
 * This differs from the buildWhere unit test in two ways:
 *   1. The unit test verifies the SHAPE of the where object; this test
 *      verifies that Prisma + Postgres actually interpret the shape as
 *      intended end-to-end.
 *   2. It covers snooze TIME semantics — active vs expired snoozes —
 *      which the unit test can't fully exercise without stubbing Date.
 */

const USER_ID = 'filter_user';

interface SeededVideos {
  channelId: string;
  plain: string;
  starred: string;
  saved: string;
  archived: string;
  snoozedActive: string;
  snoozedExpired: string;
}

async function seed(): Promise<SeededVideos> {
  await global.testPrisma.user.create({
    data: { source_id: USER_ID, name: 'Filter', email: 'filter@example.com' },
  });
  const channel = await global.testPrisma.channel.create({
    data: { source_id: 'chan1', name: 'Chan One', rss_url: 'https://example.com/chan1.xml' },
  });
  await global.testPrisma.userSubscription.create({
    data: { user_id: USER_ID, channel_id: channel.id },
  });

  // Six videos with deterministic publish times so ordering is stable.
  const baseMs = new Date('2026-01-01T00:00:00Z').getTime();
  const hour = 60 * 60 * 1000;
  const videos = await global.testPrisma.video.createManyAndReturn({
    data: [
      {
        channel_id: channel.id,
        source_id: 'vid_plain',
        title: 'Plain',
        published_at: new Date(baseMs),
      },
      {
        channel_id: channel.id,
        source_id: 'vid_starred',
        title: 'Starred',
        published_at: new Date(baseMs - hour),
      },
      {
        channel_id: channel.id,
        source_id: 'vid_saved',
        title: 'Saved',
        published_at: new Date(baseMs - 2 * hour),
      },
      {
        channel_id: channel.id,
        source_id: 'vid_archived',
        title: 'Archived',
        published_at: new Date(baseMs - 3 * hour),
      },
      {
        channel_id: channel.id,
        source_id: 'vid_snoozed_active',
        title: 'Snoozed (active)',
        published_at: new Date(baseMs - 4 * hour),
      },
      {
        channel_id: channel.id,
        source_id: 'vid_snoozed_expired',
        title: 'Snoozed (expired)',
        published_at: new Date(baseMs - 5 * hour),
      },
    ],
    select: { id: true, source_id: true },
  });
  const byKey: Record<string, string> = {};
  for (const v of videos) {
    byKey[v.source_id] = v.id;
  }

  // Apply triage state
  await global.testPrisma.videoStar.create({
    data: { user_id: USER_ID, video_id: byKey.vid_starred },
  });
  await global.testPrisma.videoSave.create({
    data: { user_id: USER_ID, video_id: byKey.vid_saved },
  });
  await global.testPrisma.videoArchive.create({
    data: { user_id: USER_ID, video_id: byKey.vid_archived },
  });
  // Active snooze: 24h in the future. Expired: 24h in the past.
  await global.testPrisma.videoSnooze.createMany({
    data: [
      {
        user_id: USER_ID,
        video_id: byKey.vid_snoozed_active,
        snooze_until: new Date(Date.now() + 24 * hour),
      },
      {
        user_id: USER_ID,
        video_id: byKey.vid_snoozed_expired,
        snooze_until: new Date(Date.now() - 24 * hour),
      },
    ],
  });

  return {
    channelId: channel.id,
    plain: byKey.vid_plain,
    starred: byKey.vid_starred,
    saved: byKey.vid_saved,
    archived: byKey.vid_archived,
    snoozedActive: byKey.vid_snoozed_active,
    snoozedExpired: byKey.vid_snoozed_expired,
  };
}

async function runFilter(channelIds: string[], queryArg: Parameters<typeof buildVideoWhere>[0]) {
  const where = buildVideoWhere(queryArg, USER_ID, channelIds);
  const rows = await global.testPrisma.video.findMany({
    where,
    select: { id: true, title: true },
    orderBy: { published_at: 'desc' },
  });
  return rows;
}

beforeEach(async () => {
  await global.testPrisma.videoStar.deleteMany();
  await global.testPrisma.videoSave.deleteMany();
  await global.testPrisma.videoArchive.deleteMany();
  await global.testPrisma.videoSnooze.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
});

describe('buildVideoWhere end-to-end with Prisma', () => {
  it('default view hides archived + active snoozes but shows expired snoozes', async () => {
    const seeded = await seed();
    const rows = await runFilter([seeded.channelId], {});
    const ids = rows.map((r) => r.id);

    // Visible: plain, starred, saved, snoozed_expired (4)
    // Hidden: archived, snoozed_active (2)
    expect(ids).toContain(seeded.plain);
    expect(ids).toContain(seeded.starred);
    expect(ids).toContain(seeded.saved);
    expect(ids).toContain(seeded.snoozedExpired);
    expect(ids).not.toContain(seeded.archived);
    expect(ids).not.toContain(seeded.snoozedActive);
  });

  it('starred=true returns only the starred video', async () => {
    const seeded = await seed();
    const rows = await runFilter([seeded.channelId], { starred: true });
    expect(rows.map((r) => r.id)).toEqual([seeded.starred]);
  });

  it('saved=true returns only the Read Later video', async () => {
    const seeded = await seed();
    const rows = await runFilter([seeded.channelId], { saved: true });
    expect(rows.map((r) => r.id)).toEqual([seeded.saved]);
  });

  it('archived=true flips to the archived bucket', async () => {
    const seeded = await seed();
    const rows = await runFilter([seeded.channelId], { archived: true });
    expect(rows.map((r) => r.id)).toEqual([seeded.archived]);
  });

  it('snoozed=true returns ONLY currently-active snoozes (not expired ones)', async () => {
    const seeded = await seed();
    const rows = await runFilter([seeded.channelId], { snoozed: true });
    expect(rows.map((r) => r.id)).toEqual([seeded.snoozedActive]);
  });

  it('includeSnoozed=true adds active snoozes back into the main feed', async () => {
    const seeded = await seed();
    const rows = await runFilter([seeded.channelId], { includeSnoozed: true });
    const ids = rows.map((r) => r.id);

    // Everything except archived (archived still excluded by default)
    expect(ids).toContain(seeded.plain);
    expect(ids).toContain(seeded.starred);
    expect(ids).toContain(seeded.saved);
    expect(ids).toContain(seeded.snoozedActive);
    expect(ids).toContain(seeded.snoozedExpired);
    expect(ids).not.toContain(seeded.archived);
  });

  it('channelId narrows to a single channel when in scope', async () => {
    const seeded = await seed();
    const rows = await runFilter([seeded.channelId], { channelId: seeded.channelId });
    // Default view rules still apply (archived / active snooze excluded)
    expect(rows.length).toBe(4);
  });
});
