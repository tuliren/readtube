import type { UserJSON } from '@clerk/nextjs/server';
import '@tests/integration-tests';

import { ensureUserExists, upsertUser } from '@/lib/db/user';

// ─── Module mocks ────────────────────────────────────────────────

jest.mock('@readtube/database', () => {
  const actual = jest.requireActual('@readtube/database');
  const prismaProxy = new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      return (global as unknown as { testPrisma: Record<string, unknown> }).testPrisma[prop];
    },
  });
  return { ...actual, prisma: prismaProxy };
});

const mockGetUser = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({ users: { getUser: (id: string) => mockGetUser(id) } }),
}));

// ─── Helpers ─────────────────────────────────────────────────────

function clerkUserJson(overrides: {
  id: string;
  email: string | null;
  name?: string;
  image?: string | null;
}): UserJSON {
  return {
    id: overrides.id,
    first_name: overrides.name ?? 'Test',
    last_name: null,
    image_url: overrides.image ?? null,
    email_addresses:
      overrides.email == null ? [] : [{ id: 'email_1', email_address: overrides.email }],
    primary_email_address_id: overrides.email == null ? null : 'email_1',
  } as unknown as UserJSON;
}

function clerkSdkUser(overrides: { id: string; email: string; name?: string }) {
  return {
    id: overrides.id,
    firstName: overrides.name ?? 'Test',
    lastName: null,
    imageUrl: 'https://img.clerk.com/test.png',
    emailAddresses: [{ id: 'email_1', emailAddress: overrides.email }],
    primaryEmailAddressId: 'email_1',
  };
}

const originalVercelEnv = process.env.VERCEL_ENV;

describe('user db helpers', () => {
  beforeEach(async () => {
    mockGetUser.mockReset();
    delete process.env.VERCEL_ENV;
    await global.testPrisma.user.deleteMany();
  });

  afterAll(() => {
    if (originalVercelEnv == null) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercelEnv;
    }
  });

  describe('upsertUser', () => {
    it('creates a user when none exists', async () => {
      await upsertUser(clerkUserJson({ id: 'user_dev1', email: 'a@example.com', name: 'Alice' }));

      const user = await global.testPrisma.user.findUnique({ where: { email: 'a@example.com' } });
      expect(user?.source_id).toBe('user_dev1');
      expect(user?.name).toBe('Alice');
    });

    it('updates profile fields for an existing source_id', async () => {
      await global.testPrisma.user.create({
        data: { source_id: 'user_dev1', email: 'a@example.com', name: 'Old Name' },
      });

      await upsertUser(
        clerkUserJson({ id: 'user_dev1', email: 'a@example.com', name: 'New Name' })
      );

      const user = await global.testPrisma.user.findUnique({ where: { source_id: 'user_dev1' } });
      expect(user?.name).toBe('New Name');
    });

    it('skips upsert when there is no primary email', async () => {
      await upsertUser(clerkUserJson({ id: 'user_dev1', email: null }));

      expect(await global.testPrisma.user.count()).toBe(0);
    });

    it.each([
      ['development (VERCEL_ENV unset)', undefined],
      ['preview', 'preview'],
    ])(
      'reassigns source_id and cascades to child rows when the email belongs to a different source_id in %s',
      async (_label, vercelEnv) => {
        if (vercelEnv != null) {
          process.env.VERCEL_ENV = vercelEnv;
        }
        await global.testPrisma.user.create({
          data: { source_id: 'user_prod1', email: 'a@example.com', name: 'Alice' },
        });
        await global.testPrisma.folder.create({
          data: { user_id: 'user_prod1', name: 'Tech' },
        });

        await upsertUser(clerkUserJson({ id: 'user_dev1', email: 'a@example.com', name: 'Alice' }));

        const users = await global.testPrisma.user.findMany();
        expect(users).toHaveLength(1);
        expect(users[0].source_id).toBe('user_dev1');
        expect(users[0].email).toBe('a@example.com');

        const folder = await global.testPrisma.folder.findUnique({
          where: { folder_unique_user_name: { user_id: 'user_dev1', name: 'Tech' } },
        });
        expect(folder).not.toBeNull();
      }
    );

    it('fails on the email conflict in production', async () => {
      process.env.VERCEL_ENV = 'production';
      await global.testPrisma.user.create({
        data: { source_id: 'user_prod1', email: 'a@example.com', name: 'Alice' },
      });

      await expect(
        upsertUser(clerkUserJson({ id: 'user_dev1', email: 'a@example.com', name: 'Alice' }))
      ).rejects.toThrow();

      const user = await global.testPrisma.user.findUnique({ where: { email: 'a@example.com' } });
      expect(user?.source_id).toBe('user_prod1');
    });
  });

  describe('ensureUserExists', () => {
    it('returns early without calling Clerk when the user row exists', async () => {
      await global.testPrisma.user.create({
        data: { source_id: 'user_dev1', email: 'a@example.com', name: 'Alice' },
      });

      await ensureUserExists('user_dev1');

      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it('creates the user from Clerk when missing', async () => {
      mockGetUser.mockResolvedValue(
        clerkSdkUser({ id: 'user_dev1', email: 'a@example.com', name: 'Alice' })
      );

      await ensureUserExists('user_dev1');

      const user = await global.testPrisma.user.findUnique({ where: { source_id: 'user_dev1' } });
      expect(user?.email).toBe('a@example.com');
      expect(user?.name).toBe('Alice');
    });

    it('reassigns source_id when the email belongs to a different source_id outside production', async () => {
      process.env.VERCEL_ENV = 'preview';
      await global.testPrisma.user.create({
        data: { source_id: 'user_prod1', email: 'a@example.com', name: 'Alice' },
      });
      mockGetUser.mockResolvedValue(
        clerkSdkUser({ id: 'user_dev1', email: 'a@example.com', name: 'Alice' })
      );

      await ensureUserExists('user_dev1');

      const users = await global.testPrisma.user.findMany();
      expect(users).toHaveLength(1);
      expect(users[0].source_id).toBe('user_dev1');
    });
  });
});
