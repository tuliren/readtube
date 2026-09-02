import '@tests/integration-tests';

import { loadInboxVideos } from '@/lib/inbox/loadVideos';
import { assertUserCanTouchVideo } from '@/lib/inbox/triageActions';
import { unsubscribeChannelForUser } from '@/lib/subscriptions';
import type { InboxQuery } from '@/lib/types';

/**
 * The user-visible half of the "keep marked videos" behavior: after a
 * channel is removed, the videos the user starred / saved / annotated
 * must still show up in the views those marks belong to, still be
 * openable, and still accept triage actions — while the channel's
 * unmarked videos disappear from the account entirely.
 *
 * `unsubscribeChannel.test.ts` covers what survives in the database;
 * this file covers what the user can still reach.
 */

const USER_ID = 'kept_user';

interface Seeded {
  channelId: string;
  starred: string;
  saved: string;
  noted: string;
  archived: string;
  plain: string;
}

async function seed(): Promise<Seeded> {
  await global.testPrisma.user.create({
    data: { source_id: USER_ID, name: 'Kept', email: 'kept@example.com' },
  });
  const channel = await global.testPrisma.channel.create({
    data: { source_id: 'kept_chan', name: 'Kept Chan', rss_url: 'https://example.com/kept.xml' },
  });
  await global.testPrisma.userSubscription.create({
    data: { user_id: USER_ID, channel_id: channel.id },
  });

  const baseMs = new Date('2026-01-01T00:00:00Z').getTime();
  const hour = 60 * 60 * 1000;
  const rows = await global.testPrisma.video.createManyAndReturn({
    data: ['starred', 'saved', 'noted', 'archived', 'plain'].map((key, index) => ({
      channel_id: channel.id,
      source_id: `kept_${key}`,
      title: `Video ${key}`,
      published_at: new Date(baseMs - index * hour),
    })),
    select: { id: true, source_id: true },
  });
  const byKey: Record<string, string> = {};
  for (const row of rows) {
    byKey[row.source_id] = row.id;
  }

  await global.testPrisma.videoStar.create({
    data: { user_id: USER_ID, video_id: byKey.kept_starred },
  });
  await global.testPrisma.videoSave.create({
    data: { user_id: USER_ID, video_id: byKey.kept_saved },
  });
  await global.testPrisma.note.create({
    data: { user_id: USER_ID, video_id: byKey.kept_noted, body: 'worth keeping' },
  });
  // The archived video is archived only — no star, save, or note — so
  // it is not kept. The starred video is ALSO archived, to prove a
  // kept video holds on to its archive state.
  await global.testPrisma.videoArchive.create({
    data: { user_id: USER_ID, video_id: byKey.kept_archived },
  });

  return {
    channelId: channel.id,
    starred: byKey.kept_starred,
    saved: byKey.kept_saved,
    noted: byKey.kept_noted,
    archived: byKey.kept_archived,
    plain: byKey.kept_plain,
  };
}

async function loadIds(query: InboxQuery): Promise<string[]> {
  const result = await loadInboxVideos(global.testPrisma, USER_ID, query);
  return result.videos.map((v) => v.id);
}

beforeEach(async () => {
  await global.testPrisma.note.deleteMany();
  await global.testPrisma.videoArchive.deleteMany();
  await global.testPrisma.videoSave.deleteMany();
  await global.testPrisma.videoStar.deleteMany();
  await global.testPrisma.userVideoConsumption.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
});

describe('views after unsubscribing a channel', () => {
  it('keeps the starred video in the Starred view', async () => {
    const seeded = await seed();
    expect(await loadIds({ starred: true })).toEqual([seeded.starred]);

    await unsubscribeChannelForUser(global.testPrisma, USER_ID, seeded.channelId);

    expect(await loadIds({ starred: true })).toEqual([seeded.starred]);
  });

  it('keeps the saved video in the Read Later view', async () => {
    const seeded = await seed();
    await unsubscribeChannelForUser(global.testPrisma, USER_ID, seeded.channelId);

    expect(await loadIds({ saved: true })).toEqual([seeded.saved]);
  });

  it('drops the archive-only video from the Archived view', async () => {
    const seeded = await seed();
    expect(await loadIds({ archived: true })).toEqual([seeded.archived]);

    await unsubscribeChannelForUser(global.testPrisma, USER_ID, seeded.channelId);

    expect(await loadIds({ archived: true })).toEqual([]);
  });

  it('keeps the archive state of a video kept by another mark', async () => {
    const seeded = await seed();
    await global.testPrisma.videoArchive.create({
      data: { user_id: USER_ID, video_id: seeded.starred },
    });

    await unsubscribeChannelForUser(global.testPrisma, USER_ID, seeded.channelId);

    expect(await loadIds({ archived: true })).toEqual([seeded.starred]);
    // Archiving clears a video from the inbox; it doesn't take the
    // video out of the bucket the user put it in.
    expect(await loadIds({ starred: true })).toEqual([seeded.starred]);
  });

  it.each<{ name: string; query: InboxQuery }>([
    { name: 'Inbox', query: {} },
    { name: 'Unread', query: { unread: true } },
  ])('leaves the $name view empty — it follows live subscriptions', async ({ query }) => {
    const seeded = await seed();
    expect((await loadIds(query)).length).toBeGreaterThan(0);

    await unsubscribeChannelForUser(global.testPrisma, USER_ID, seeded.channelId);

    expect(await loadIds(query)).toEqual([]);
  });

  it('finds a kept video through the mark view’s search box', async () => {
    const seeded = await seed();
    await unsubscribeChannelForUser(global.testPrisma, USER_ID, seeded.channelId);

    expect(await loadIds({ starred: true, q: 'starred' })).toEqual([seeded.starred]);
    expect(await loadIds({ starred: true, q: 'nomatchhere' })).toEqual([]);
  });

  it('still surfaces the mark flags on a kept video', async () => {
    const seeded = await seed();
    await unsubscribeChannelForUser(global.testPrisma, USER_ID, seeded.channelId);

    const result = await loadInboxVideos(global.testPrisma, USER_ID, { starred: true });
    expect(result.total).toBe(1);
    expect(result.videos[0].isStarred).toBe(true);
    expect(result.videos[0].channelName).toBe('Kept Chan');
  });

  it.each<{ name: string; key: keyof Seeded; reachable: boolean }>([
    { name: 'starred', key: 'starred', reachable: true },
    { name: 'saved', key: 'saved', reachable: true },
    { name: 'noted', key: 'noted', reachable: true },
    { name: 'archive-only', key: 'archived', reachable: false },
    { name: 'unmarked', key: 'plain', reachable: false },
  ])('$name video is reachable=$reachable after unsubscribing', async ({ key, reachable }) => {
    const seeded = await seed();
    await unsubscribeChannelForUser(global.testPrisma, USER_ID, seeded.channelId);

    const ok = await assertUserCanTouchVideo(global.testPrisma, {
      userId: USER_ID,
      videoId: seeded[key] as string,
    });
    expect(ok).toBe(reachable);
  });

  it('lets go of a kept video once its last mark is removed', async () => {
    const seeded = await seed();
    await unsubscribeChannelForUser(global.testPrisma, USER_ID, seeded.channelId);

    await global.testPrisma.videoStar.deleteMany({
      where: { user_id: USER_ID, video_id: seeded.starred },
    });

    expect(await loadIds({ starred: true })).toEqual([]);
    expect(
      await assertUserCanTouchVideo(global.testPrisma, {
        userId: USER_ID,
        videoId: seeded.starred,
      })
    ).toBe(false);
  });

  it('shows mark views for a user with no subscriptions at all', async () => {
    const seeded = await seed();
    await unsubscribeChannelForUser(global.testPrisma, USER_ID, seeded.channelId);

    expect(
      await global.testPrisma.userSubscription.findMany({ where: { user_id: USER_ID } })
    ).toEqual([]);
    expect(await loadIds({ saved: true })).toEqual([seeded.saved]);
  });

  it('composes a mark view with unread across the removed channel', async () => {
    // A removed channel has no watermark left, so its kept videos are
    // unread until an explicit consumption row says otherwise. The
    // mark view isn't channel-scoped, so neither is its unread arm.
    const seeded = await seed();
    await unsubscribeChannelForUser(global.testPrisma, USER_ID, seeded.channelId);

    expect(await loadIds({ starred: true, unread: true })).toEqual([seeded.starred]);

    await global.testPrisma.userVideoConsumption.create({
      data: { user_id: USER_ID, video_id: seeded.starred },
    });
    expect(await loadIds({ starred: true, unread: true })).toEqual([]);
    // Reading it doesn't remove it from the Starred view itself.
    expect(await loadIds({ starred: true })).toEqual([seeded.starred]);
  });

  it('does not leak another user’s marked videos into the Starred view', async () => {
    const seeded = await seed();
    await global.testPrisma.user.create({
      data: { source_id: 'kept_other', name: 'Other', email: 'kept_other@example.com' },
    });
    await global.testPrisma.videoStar.create({
      data: { user_id: 'kept_other', video_id: seeded.plain },
    });

    await unsubscribeChannelForUser(global.testPrisma, USER_ID, seeded.channelId);

    expect(await loadIds({ starred: true })).toEqual([seeded.starred]);
  });
});
