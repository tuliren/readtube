import { type PrismaClient, UserRequestType } from '@readtube/database';

import {
  MONTHLY_GENERATION_QUOTA,
  countMonthlyTranscriptGenerations,
  getGenerationUsage,
  getLifetimeUsage,
  getMonthlyQuotaPeriod,
  toTranscriptBreakdown,
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

describe('toTranscriptBreakdown', () => {
  it.each([
    { name: 'no rows', rows: [], expected: { captions: 0, generated: 0 } },
    {
      name: 'captions only',
      rows: [{ model: null, _count: { _all: 4 } }],
      expected: { captions: 4, generated: 0 },
    },
    {
      name: 'captions and several models',
      rows: [
        { model: null, _count: { _all: 4 } },
        { model: 'model-a', _count: { _all: 2 } },
        { model: 'model-b', _count: { _all: 1 } },
      ],
      expected: { captions: 4, generated: 3 },
    },
  ])('folds $name', ({ rows, expected }) => {
    expect(toTranscriptBreakdown(rows)).toEqual(expected);
  });
});

describe('countMonthlyTranscriptGenerations', () => {
  it("counts only this user's transcript requests within the current month, by source", async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { model: null, _count: { _all: 5 } },
      { model: 'model-a', _count: { _all: 2 } },
    ]);
    const prisma = { userRequest: { groupBy } } as unknown as PrismaClient;

    const result = await countMonthlyTranscriptGenerations(
      prisma,
      'user_abc',
      new Date('2026-06-15T12:00:00.000Z')
    );

    expect(result).toEqual({ captions: 5, generated: 2 });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['model'],
      where: {
        user_id: 'user_abc',
        type: UserRequestType.TRANSCRIPT,
        created_at: {
          gte: new Date('2026-06-01T00:00:00.000Z'),
          lt: new Date('2026-07-01T00:00:00.000Z'),
        },
      },
      _count: { _all: true },
    });
  });
});

describe('getGenerationUsage', () => {
  it('assembles used count, breakdown, quota, and period bounds', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { model: null, _count: { _all: 40 } },
      { model: 'model-a', _count: { _all: 2 } },
    ]);
    const prisma = { userRequest: { groupBy } } as unknown as PrismaClient;

    const usage = await getGenerationUsage(
      prisma,
      'user_abc',
      new Date('2026-06-15T12:00:00.000Z')
    );

    expect(usage).toEqual({
      used: 42,
      breakdown: { captions: 40, generated: 2 },
      quota: MONTHLY_GENERATION_QUOTA,
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-07-01T00:00:00.000Z'),
    });
  });
});

describe('getLifetimeUsage', () => {
  it('maps grouped counts onto each request type and transcript source', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { type: UserRequestType.TRANSCRIPT, model: null, _count: { _all: 12 } },
      { type: UserRequestType.TRANSCRIPT, model: 'model-a', _count: { _all: 3 } },
      { type: UserRequestType.SUMMARY, model: 'model-b', _count: { _all: 4 } },
      { type: UserRequestType.SUMMARY, model: 'model-c', _count: { _all: 1 } },
      // ARTICLE absent — the user has never generated one.
    ]);
    const prisma = { userRequest: { groupBy } } as unknown as PrismaClient;

    const lifetime = await getLifetimeUsage(prisma, 'user_abc');

    expect(lifetime).toEqual({
      transcript: { captions: 12, generated: 3 },
      summary: 5,
      article: 0,
    });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['type', 'model'],
      where: { user_id: 'user_abc' },
      _count: { _all: true },
    });
  });
});
