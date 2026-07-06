import { VideoPlatformType } from '@readtube/database';
// The stub from tests/mocks (wired via moduleNameMapper) exposes a
// no-op `track`; spy on it to assert whether the emitter forwards.
import { track } from '@vercel/analytics/server';

import { platformLabel, trackContentAdded } from '../events';

jest.mock('@vercel/analytics/server', () => ({ track: jest.fn(() => Promise.resolve()) }));

describe('platformLabel', () => {
  it.each([
    [VideoPlatformType.YOUTUBE, 'youtube'],
    [VideoPlatformType.BILIBILI, 'bilibili'],
  ])('maps %s to %s', (type, expected) => {
    expect(platformLabel(type)).toBe(expected);
  });
});

describe('event emission gating', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    (track as jest.Mock).mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.each([['production'], ['preview']])('emits on Vercel %s', async (vercelEnv) => {
    process.env = { ...originalEnv, VERCEL_ENV: vercelEnv };

    await trackContentAdded('channel', 'youtube');

    expect(track).toHaveBeenCalledWith('content_added', { type: 'channel', platform: 'youtube' });
  });

  it.each([
    ['development', 'development'],
    ['unset VERCEL_ENV (local/scripts/tests)', undefined],
  ])('stays silent for %s', async (_label, vercelEnv) => {
    process.env = { ...originalEnv };
    delete process.env.VERCEL_ENV;
    if (vercelEnv != null) {
      process.env.VERCEL_ENV = vercelEnv;
    }

    await trackContentAdded('channel', 'youtube');

    expect(track).not.toHaveBeenCalled();
  });

  it('never rejects even when track throws', async () => {
    process.env = { ...originalEnv, VERCEL_ENV: 'production' };
    (track as jest.Mock).mockRejectedValueOnce(new Error('collector down'));

    await expect(trackContentAdded('video', 'youtube')).resolves.toBeUndefined();
  });
});
