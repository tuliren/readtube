import '@tests/integration-tests';

/**
 * Integration coverage for the Folder model + the (user, channel) →
 * folder assignment flow that PR #7 introduced. We exercise the DB
 * directly (no HTTP layer) so these assertions lock in the schema
 * contract, not the route handler. The route handlers just call into
 * the same prisma queries tested here.
 */

async function seedUser(userId: string) {
  await global.testPrisma.user.create({
    data: {
      source_id: userId,
      name: `User ${userId}`,
      email: `${userId}@example.com`,
    },
  });
}

async function seedChannel(sourceId: string) {
  return global.testPrisma.channel.create({
    data: {
      source_id: sourceId,
      name: `Channel ${sourceId}`,
      rss_url: `https://example.com/${sourceId}.xml`,
    },
  });
}

beforeEach(async () => {
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.folder.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
});

describe('Folder model', () => {
  it('creates a folder scoped to a user', async () => {
    await seedUser('user1');

    const folder = await global.testPrisma.folder.create({
      data: { user_id: 'user1', name: 'Tech', sort_order: 0 },
    });

    expect(folder.id).toMatch(/^c/); // cuid starts with 'c'
    expect(folder.name).toBe('Tech');
    expect(folder.sort_order).toBe(0);
  });

  it('allows two users to have folders with the same name', async () => {
    await seedUser('user1');
    await seedUser('user2');

    await global.testPrisma.folder.create({
      data: { user_id: 'user1', name: 'Tech', sort_order: 0 },
    });
    const second = await global.testPrisma.folder.create({
      data: { user_id: 'user2', name: 'Tech', sort_order: 0 },
    });

    expect(second.user_id).toBe('user2');
  });

  it('rejects duplicate (user_id, name) via the unique constraint', async () => {
    await seedUser('user1');

    await global.testPrisma.folder.create({
      data: { user_id: 'user1', name: 'Tech', sort_order: 0 },
    });

    await expect(
      global.testPrisma.folder.create({
        data: { user_id: 'user1', name: 'Tech', sort_order: 1 },
      })
    ).rejects.toThrow();
  });
});

describe('Folder ↔ UserSubscription FK behavior', () => {
  it('SetNull on folder delete: subscriptions fall back to root', async () => {
    await seedUser('user1');
    const channel = await seedChannel('chan1');
    const folder = await global.testPrisma.folder.create({
      data: { user_id: 'user1', name: 'Tech', sort_order: 0 },
    });

    await global.testPrisma.userSubscription.create({
      data: { user_id: 'user1', channel_id: channel.id, folder_id: folder.id },
    });

    // Deleting the folder should drop the folder_id on the subscription,
    // not delete the subscription itself.
    await global.testPrisma.folder.delete({ where: { id: folder.id } });

    const sub = await global.testPrisma.userSubscription.findFirst({
      where: { user_id: 'user1', channel_id: channel.id },
    });
    expect(sub).not.toBeNull();
    expect(sub?.folder_id).toBeNull();
  });

  it('moves a subscription between folders without touching other users', async () => {
    await seedUser('user1');
    await seedUser('user2');
    const channel = await seedChannel('chan1');

    const [folderA, folderB] = await Promise.all([
      global.testPrisma.folder.create({
        data: { user_id: 'user1', name: 'A', sort_order: 0 },
      }),
      global.testPrisma.folder.create({
        data: { user_id: 'user1', name: 'B', sort_order: 1 },
      }),
    ]);

    // user2 subscribes to the same channel under a folder of their own
    const user2Folder = await global.testPrisma.folder.create({
      data: { user_id: 'user2', name: 'User2 Tech', sort_order: 0 },
    });
    await global.testPrisma.userSubscription.createMany({
      data: [
        { user_id: 'user1', channel_id: channel.id, folder_id: folderA.id },
        { user_id: 'user2', channel_id: channel.id, folder_id: user2Folder.id },
      ],
    });

    // Move user1's subscription from A → B. This mimics the
    // PATCH /api/subscriptions/[channelId]/folder call path.
    await global.testPrisma.userSubscription.updateMany({
      where: { user_id: 'user1', channel_id: channel.id },
      data: { folder_id: folderB.id },
    });

    const user1Sub = await global.testPrisma.userSubscription.findFirst({
      where: { user_id: 'user1', channel_id: channel.id },
    });
    const user2Sub = await global.testPrisma.userSubscription.findFirst({
      where: { user_id: 'user2', channel_id: channel.id },
    });

    expect(user1Sub?.folder_id).toBe(folderB.id);
    // user2's subscription MUST stay untouched — scoped updateMany
    expect(user2Sub?.folder_id).toBe(user2Folder.id);
  });

  it('unassigns a subscription by setting folder_id to null', async () => {
    await seedUser('user1');
    const channel = await seedChannel('chan1');
    const folder = await global.testPrisma.folder.create({
      data: { user_id: 'user1', name: 'Tech', sort_order: 0 },
    });

    await global.testPrisma.userSubscription.create({
      data: { user_id: 'user1', channel_id: channel.id, folder_id: folder.id },
    });

    await global.testPrisma.userSubscription.updateMany({
      where: { user_id: 'user1', channel_id: channel.id },
      data: { folder_id: null },
    });

    const sub = await global.testPrisma.userSubscription.findFirst({
      where: { user_id: 'user1', channel_id: channel.id },
    });
    expect(sub?.folder_id).toBeNull();
  });
});
