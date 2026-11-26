/**
 * @jest-environment node
 */
import { requireDashboardUserId } from '@/lib/dashboardUser';

const mockAuth = jest.fn();
const mockEnsureUserExists = jest.fn();
const mockRedirect = jest.fn((url: string) => {
  throw new Error(`redirect:${url}`);
});

// React only exports `cache` under the react-server condition.
jest.mock('react', () => ({ cache: <T>(fn: T) => fn }));
jest.mock('@clerk/nextjs/server', () => ({ auth: () => mockAuth() }));
jest.mock('next/navigation', () => ({ redirect: (url: string) => mockRedirect(url) }));
jest.mock('@/lib/db/user', () => ({
  ensureUserExists: (userId: string) => mockEnsureUserExists(userId),
}));

describe('requireDashboardUserId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the user id only after the user row is ensured', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_1' });
    let ensured = false;
    mockEnsureUserExists.mockImplementation(async () => {
      await Promise.resolve();
      ensured = true;
    });

    const userId = await requireDashboardUserId();

    expect(userId).toBe('user_1');
    expect(mockEnsureUserExists).toHaveBeenCalledWith('user_1');
    expect(ensured).toBe(true);
  });

  it('redirects home without touching the database when signed out', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    await expect(requireDashboardUserId()).rejects.toThrow('redirect:/');
    expect(mockEnsureUserExists).not.toHaveBeenCalled();
  });
});
