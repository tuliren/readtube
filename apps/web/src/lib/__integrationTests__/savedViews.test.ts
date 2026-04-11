import '@tests/integration-tests';

import type { InboxQuery } from '@/lib/types';

/**
 * Integration coverage for the SavedView model introduced in PR #9.
 * We test the DB contract (user scoping, JSONB round-trip, ordering)
 * directly rather than going through the /api/saved-views route
 * handlers — route handlers are thin wrappers around these exact
 * queries, so exercising the prisma layer locks in the invariant.
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

beforeEach(async () => {
  await global.testPrisma.savedView.deleteMany();
  await global.testPrisma.user.deleteMany();
});

describe('SavedView CRUD', () => {
  it('creates a saved view with a JSONB query payload', async () => {
    await seedUser('user1');
    const query: InboxQuery = { starred: true, unread: true, sort: 'oldest' };

    const row = await global.testPrisma.savedView.create({
      data: {
        user_id: 'user1',
        name: 'Unread starred (oldest first)',
        query: query as unknown as object,
      },
    });

    expect(row.name).toBe('Unread starred (oldest first)');
    // JSONB round-trip should preserve every field
    expect(row.query).toEqual(query);
  });

  it('lists only the calling user\u2019s views (IDOR isolation)', async () => {
    await seedUser('owner');
    await seedUser('intruder');

    await global.testPrisma.savedView.createMany({
      data: [
        {
          user_id: 'owner',
          name: 'My starred',
          query: { starred: true } as unknown as object,
        },
        {
          user_id: 'owner',
          name: 'My archived',
          query: { archived: true } as unknown as object,
        },
        {
          user_id: 'intruder',
          name: 'Not mine',
          query: { starred: true } as unknown as object,
        },
      ],
    });

    const ownerViews = await global.testPrisma.savedView.findMany({
      where: { user_id: 'owner' },
      orderBy: { created_at: 'asc' },
    });
    expect(ownerViews.map((v) => v.name)).toEqual(['My starred', 'My archived']);

    // Scoped query across all users — owner should not see 'Not mine'
    const leakedForOwner = ownerViews.find((v) => v.name === 'Not mine');
    expect(leakedForOwner).toBeUndefined();
  });

  it('delete is scoped by (id, user_id) so foreign ids are silent no-ops', async () => {
    await seedUser('owner');
    await seedUser('intruder');

    const view = await global.testPrisma.savedView.create({
      data: {
        user_id: 'owner',
        name: 'My view',
        query: { unread: true } as unknown as object,
      },
    });

    // Intruder tries to delete by guessing the id. deleteMany with the
    // (id, user_id) compound should match zero rows.
    const result = await global.testPrisma.savedView.deleteMany({
      where: { id: view.id, user_id: 'intruder' },
    });
    expect(result.count).toBe(0);

    // Owner's row is untouched
    const stillThere = await global.testPrisma.savedView.findUnique({
      where: { id: view.id },
    });
    expect(stillThere).not.toBeNull();
  });

  it('stores every InboxQuery key in JSONB without loss', async () => {
    await seedUser('user1');

    const query: InboxQuery = {
      q: 'rust',
      channelId: 'chan_a',
      folderId: 'folder_b',
      tagIds: ['tag_x', 'tag_y'],
      unread: true,
      starred: true,
      saved: false,
      snoozed: true,
      archived: false,
      includeSnoozed: false,
      from: '2026-01-01',
      to: '2026-02-01',
      sort: 'oldest',
    };

    const row = await global.testPrisma.savedView.create({
      data: {
        user_id: 'user1',
        name: 'Every key',
        query: query as unknown as object,
      },
    });
    expect(row.query).toEqual(query);
  });
});
