import { type PrismaClient, UserRequestType } from '@readtube/database';

import {
  MONTHLY_GENERATION_QUOTA,
  countMonthlyTranscriptGenerations,
  getGenerationUsage,
  getLifetimeUsage,
  getMonthlyQuotaPeriod,
} from '@/lib/usage/quota';

describe('getMonthlyQuotaPeriod', () => {
  it.each([
    {
      name: 'mid-month',
      now: '2026-06-15T12:34:56.000Z',
      start: '2026-06-01T00:00:00.000Z',
      end: '2026-07-01T00:00:00.000Z',
    },
    {
      name: 'first instant of the month',
      now: '2026-06-01T00:00:00.000Z',
      start: '2026-06-01T00:00:00.000Z',
      end: '2026-07-01T00:00:00.000Z',
    },
    {
      name: 'last instant of the month',
      now: '2026-06-30T23:59:59.999Z',
      start: '2026-06-01T00:00:00.000Z',
      end: '2026-07-01T00:00:00.000Z',
    },
    {
      name: 'December rolls the year over',
      now: '2026-12-20T08:00:00.000Z',
      start: '2026-12-01T00:00:00.000Z',
      end: '2027-01-01T00:00:00.000Z',
    },
    {
      name: 'February in a leap year',
      now: '2028-02-29T23:00:00.000Z',
      start: '2028-02-01T00:00:00.000Z',
      end: '2028-03-01T00:00:00.000Z',
    },
  ])('returns the UTC month window for $name', ({ now, start, end }) => {
    const period = getMonthlyQuotaPeriod(new Date(now));
    expect(period.start.toISOString()).toBe(start);
    expect(period.end.toISOString()).toBe(end);
  });
});

describe('countMonthlyTranscriptGenerations', () => {
  it("counts only this user's transcript requests within the current month", async () => {
    const count = jest.fn().mockResolvedValue(7);
    const prisma = { userRequest: { count } } as unknown as PrismaClient;

    const result = await countMonthlyTranscriptGenerations(
      prisma,
      'user_abc',
      new Date('2026-06-15T12:00:00.000Z')
    );

    expect(result).toBe(7);
    expect(count).toHaveBeenCalledWith({
      where: {
        user_id: 'user_abc',
        type: UserRequestType.TRANSCRIPT,
        created_at: {
          gte: new Date('2026-06-01T00:00:00.000Z'),
          lt: new Date('2026-07-01T00:00:00.000Z'),
        },
      },
    });
  });
});

describe('getGenerationUsage', () => {
  it('assembles used count, quota, and period bounds', async () => {
    const count = jest.fn().mockResolvedValue(42);
    const prisma = { userRequest: { count } } as unknown as PrismaClient;

    const usage = await getGenerationUsage(
      prisma,
      'user_abc',
      new Date('2026-06-15T12:00:00.000Z')
    );

    expect(usage).toEqual({
      used: 42,
      quota: MONTHLY_GENERATION_QUOTA,
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-07-01T00:00:00.000Z'),
    });
  });
});

describe('getLifetimeUsage', () => {
  it('maps grouped counts onto each request type', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { type: UserRequestType.TRANSCRIPT, _count: { _all: 12 } },
      { type: UserRequestType.SUMMARY, _count: { _all: 5 } },
      // ARTICLE absent — the user has never generated one.
    ]);
    const prisma = { userRequest: { groupBy } } as unknown as PrismaClient;

    const lifetime = await getLifetimeUsage(prisma, 'user_abc');

    expect(lifetime).toEqual({ transcript: 12, summary: 5, article: 0 });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['type'],
      where: { user_id: 'user_abc' },
      _count: { _all: true },
    });
  });
});
