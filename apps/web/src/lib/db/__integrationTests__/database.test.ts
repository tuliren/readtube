import '@tests/integration-tests';

describe('Database Integration Tests', () => {
  beforeEach(async () => {
    await global.testPrisma.user.deleteMany();
  });

  it('creates and retrieves a User', async () => {
    const userData = {
      source_id: 'user_test123',
      email: 'test@example.com',
      name: 'Test User',
    };

    const createdUser = await global.testPrisma.user.create({
      data: userData,
    });

    expect(createdUser.email).toBe(userData.email);
    expect(createdUser.name).toBe(userData.name);
    expect(createdUser.source_id).toBe(userData.source_id);

    const retrievedUser = await global.testPrisma.user.findUnique({
      where: { email: userData.email },
    });

    expect(retrievedUser).not.toBeNull();
    expect(retrievedUser?.email).toBe(createdUser.email);
    expect(retrievedUser?.name).toBe(createdUser.name);
    expect(retrievedUser?.source_id).toBe(createdUser.source_id);
  });

  it('handles unique email constraint', async () => {
    const userData = {
      source_id: 'user_unique1',
      email: 'duplicate@example.com',
      name: 'Test User',
    };

    await global.testPrisma.user.create({ data: userData });

    await expect(
      global.testPrisma.user.create({
        data: {
          source_id: 'user_unique2',
          email: 'duplicate@example.com',
          name: 'Another User',
        },
      })
    ).rejects.toThrow();
  });

  it('handles unique source_id constraint', async () => {
    const userData = {
      source_id: 'user_duplicate',
      email: 'first@example.com',
      name: 'First User',
    };

    await global.testPrisma.user.create({ data: userData });

    await expect(
      global.testPrisma.user.create({
        data: {
          source_id: 'user_duplicate',
          email: 'second@example.com',
          name: 'Second User',
        },
      })
    ).rejects.toThrow();
  });
});
