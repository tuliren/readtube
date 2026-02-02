import '@tests/integration-tests';

describe('Database Integration Tests', () => {
  beforeEach(async () => {
    await global.testPrisma.clerkUser.deleteMany();
  });

  it('creates and retrieves a ClerkUser', async () => {
    const userData = {
      user_id: 'user_test123',
      email: 'test@example.com',
      name: 'Test User',
    };

    const createdUser = await global.testPrisma.clerkUser.create({
      data: userData,
    });

    expect(createdUser.email).toBe(userData.email);
    expect(createdUser.name).toBe(userData.name);
    expect(createdUser.user_id).toBe(userData.user_id);

    const retrievedUser = await global.testPrisma.clerkUser.findUnique({
      where: { email: userData.email },
    });

    expect(retrievedUser).not.toBeNull();
    expect(retrievedUser?.email).toBe(createdUser.email);
    expect(retrievedUser?.name).toBe(createdUser.name);
    expect(retrievedUser?.user_id).toBe(createdUser.user_id);
  });

  it('handles unique email constraint', async () => {
    const userData = {
      user_id: 'user_unique1',
      email: 'duplicate@example.com',
      name: 'Test User',
    };

    await global.testPrisma.clerkUser.create({ data: userData });

    await expect(
      global.testPrisma.clerkUser.create({
        data: {
          user_id: 'user_unique2',
          email: 'duplicate@example.com',
          name: 'Another User',
        },
      })
    ).rejects.toThrow();
  });

  it('handles unique user_id constraint', async () => {
    const userData = {
      user_id: 'user_duplicate',
      email: 'first@example.com',
      name: 'First User',
    };

    await global.testPrisma.clerkUser.create({ data: userData });

    await expect(
      global.testPrisma.clerkUser.create({
        data: {
          user_id: 'user_duplicate',
          email: 'second@example.com',
          name: 'Second User',
        },
      })
    ).rejects.toThrow();
  });
});
