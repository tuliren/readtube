import { type PrismaClient, UserRequestOutcome, UserRequestType } from '@readtube/database';

import { TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS } from '@/constants';
import {
  MONTHLY_GENERATED_TRANSCRIPT_MINUTES_QUOTA,
  MONTHLY_GENERATION_QUOTA,
  countMonthlyCaptionFetches,
  getGenerationUsage,
  getLifetimeUsage,
  getMonthlyGeneratedTranscriptUsage,
  getMonthlyQuotaPeriod,
  toGeneratedMinutes,
  toTranscriptBreakdown,
} from '@/lib/usage/quota';

const JUNE_WINDOW = {
  gte: new Date('2026-06-01T00:00:00.000Z'),
  lt: new Date('2026-07-01T00:00:00.000Z'),
};

const withDurations = (durations: (number | null)[]) =>
  durations.map((duration_seconds) => ({ video: { duration_seconds } }));

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

describe('countMonthlyCaptionFetches', () => {
  it("counts only this user's captions-path transcript requests within the current month", async () => {
    const count = jest.fn().mockResolvedValue(7);
    const prisma = { userRequest: { count } } as unknown as PrismaClient;

    const result = await countMonthlyCaptionFetches(
      prisma,
      'user_abc',
      new Date('2026-06-15T12:00:00.000Z')
    );

    expect(result).toBe(7);
    expect(count).toHaveBeenCalledWith({
      where: {
        user_id: 'user_abc',
        type: UserRequestType.TRANSCRIPT,
        model: null,
        created_at: JUNE_WINDOW,
      },
    });
  });
});

describe('toGeneratedMinutes', () => {
  it.each([
    { name: 'no generations', durations: [], expected: 0 },
    { name: 'a single video', durations: [20 * 60], expected: 20 },
    { name: 'several videos', durations: [20 * 60, 45 * 60 + 30], expected: 66 },
    { name: 'a missing duration as zero', durations: [null, 10 * 60], expected: 10 },
    {
      name: 'a video longer than the generation cap at the cap',
      durations: [TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS + 60 * 60],
      expected: TRANSCRIPT_GENERATION_MAX_VIDEO_SECONDS / 60,
    },
  ])('counts $name', ({ durations, expected }) => {
    expect(toGeneratedMinutes(durations)).toBe(expected);
  });
});

describe('getMonthlyGeneratedTranscriptUsage', () => {
  it('sums video minutes of completed Gemini generations within the current month', async () => {
    const findMany = jest.fn().mockResolvedValue(withDurations([30 * 60, 15 * 60]));
    const prisma = { userRequest: { findMany } } as unknown as PrismaClient;

    const result = await getMonthlyGeneratedTranscriptUsage(
      prisma,
      'user_abc',
      new Date('2026-06-15T12:00:00.000Z')
    );

    expect(result).toEqual({ videos: 2, minutes: 45 });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        user_id: 'user_abc',
        type: UserRequestType.TRANSCRIPT,
        model: { not: null },
        outcome: UserRequestOutcome.GENERATED,
        completed_at: { not: null },
        created_at: JUNE_WINDOW,
      },
      select: { video: { select: { duration_seconds: true } } },
    });
  });
});

describe('getGenerationUsage', () => {
  it('assembles caption and Gemini usage, quotas, and period bounds', async () => {
    const count = jest.fn().mockResolvedValue(40);
    const findMany = jest.fn().mockResolvedValue(withDurations([50 * 60, 40 * 60]));
    const prisma = { userRequest: { count, findMany } } as unknown as PrismaClient;

    const usage = await getGenerationUsage(
      prisma,
      'user_abc',
      new Date('2026-06-15T12:00:00.000Z')
    );

    expect(usage).toEqual({
      captions: { used: 40, quota: MONTHLY_GENERATION_QUOTA },
      generated: {
        videos: 2,
        minutes: 90,
        quotaMinutes: MONTHLY_GENERATED_TRANSCRIPT_MINUTES_QUOTA,
      },
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
