import type { InboxQuery } from '@/lib/types';

import { buildUnreadClause, buildVideoWhere } from '../buildWhere';

// Every test uses this stable channel set and user to keep assertions
// focused on the filter logic rather than scoping boilerplate.
const USER_ID = 'user_test';
const CHANNEL_IDS = ['chan_a', 'chan_b', 'chan_c'];

describe('buildVideoWhere — channel scope', () => {
  it('defaults to { channel_id: { in: channelIds } }', () => {
    const where = buildVideoWhere({}, USER_ID, CHANNEL_IDS);
    expect(where.channel_id).toEqual({ in: CHANNEL_IDS });
  });

  it('narrows to a single channel when channelId is in the allowed list', () => {
    const where = buildVideoWhere({ channelId: 'chan_b' }, USER_ID, CHANNEL_IDS);
    expect(where.channel_id).toBe('chan_b');
  });

  it('falls back to the full allowed list when channelId is NOT in scope', () => {
    // IDOR-safe fallback — never trust the client param alone.
    const where = buildVideoWhere({ channelId: 'chan_intruder' }, USER_ID, CHANNEL_IDS);
    expect(where.channel_id).toEqual({ in: CHANNEL_IDS });
  });

  it('omits the channel scope clause entirely when skipChannelScope is set', () => {
    // Library scopes pre-compute the allowed video id set and pass it
    // in as `id: { in: ... }` at the call site, so the channel clause
    // should not be emitted.
    const where = buildVideoWhere({}, USER_ID, CHANNEL_IDS, { skipChannelScope: true });
    expect(where.channel_id).toBeUndefined();
  });
});

describe('buildVideoWhere — date window', () => {
  it.each<{ query: InboxQuery; expected: { gte?: Date; lte?: Date } }>([
    { query: {}, expected: {} },
    { query: { from: '2026-01-01' }, expected: { gte: new Date('2026-01-01') } },
    { query: { to: '2026-02-01' }, expected: { lte: new Date('2026-02-01') } },
    {
      query: { from: '2026-01-01', to: '2026-02-01' },
      expected: { gte: new Date('2026-01-01'), lte: new Date('2026-02-01') },
    },
  ])('composes $query correctly', ({ query, expected }) => {
    const where = buildVideoWhere(query, USER_ID, CHANNEL_IDS);
    if (expected.gte == null && expected.lte == null) {
      expect(where.published_at).toBeUndefined();
    } else {
      expect(where.published_at).toEqual(expected);
    }
  });
});

describe('buildVideoWhere — tags', () => {
  it('omits tag filter when tagIds is absent or empty', () => {
    expect(buildVideoWhere({}, USER_ID, CHANNEL_IDS).AND).toBeUndefined();
    expect(buildVideoWhere({ tagIds: [] }, USER_ID, CHANNEL_IDS).AND).toBeUndefined();
  });

  it('ANDs every tag (each must match independently)', () => {
    const where = buildVideoWhere({ tagIds: ['tag_a', 'tag_b'] }, USER_ID, CHANNEL_IDS);
    expect(where.AND).toEqual([
      { tags: { some: { tag_id: 'tag_a', user_id: USER_ID } } },
      { tags: { some: { tag_id: 'tag_b', user_id: USER_ID } } },
    ]);
  });
});

describe('buildVideoWhere — archive mode', () => {
  it('excludes archived videos by default', () => {
    const where = buildVideoWhere({}, USER_ID, CHANNEL_IDS);
    expect(where.archives).toEqual({ none: { user_id: USER_ID } });
  });

  it('shows only archived when archived=true', () => {
    const where = buildVideoWhere({ archived: true }, USER_ID, CHANNEL_IDS);
    expect(where.archives).toEqual({ some: { user_id: USER_ID } });
  });
});

describe('buildVideoWhere — star + save filters', () => {
  it.each([
    {
      name: 'starred only',
      query: { starred: true } as InboxQuery,
      expectedKey: 'stars',
    },
    {
      name: 'saved only',
      query: { saved: true } as InboxQuery,
      expectedKey: 'saves',
    },
  ])('$name restricts via { some: { user_id } }', ({ query, expectedKey }) => {
    const where = buildVideoWhere(query, USER_ID, CHANNEL_IDS) as Record<string, unknown>;
    expect(where[expectedKey]).toEqual({ some: { user_id: USER_ID } });
  });

  it('starred=true + saved=true requires BOTH (implicit AND via Prisma)', () => {
    const where = buildVideoWhere({ starred: true, saved: true }, USER_ID, CHANNEL_IDS);
    expect(where.stars).toEqual({ some: { user_id: USER_ID } });
    expect(where.saves).toEqual({ some: { user_id: USER_ID } });
  });
});

describe('buildUnreadClause', () => {
  const watermark = new Date('2026-02-01');

  it('emits a consumption-none guard so videos with a Consumption row drop out', () => {
    const clause = buildUnreadClause(USER_ID, CHANNEL_IDS, new Map());
    expect(clause.AND).toEqual(
      expect.arrayContaining([
        {
          consumptions: { none: { user_id: USER_ID } },
        },
      ])
    );
  });

  it('treats a channel with no watermark as fully unread (no published_at filter)', () => {
    const clause = buildUnreadClause(USER_ID, ['chan_a'], new Map());
    const orClause = (clause.AND as unknown as Array<{ OR?: unknown }>).find(
      (entry) => entry.OR != null
    );
    expect(orClause).toEqual({ OR: [{ channel_id: 'chan_a' }] });
  });

  it('emits per-channel watermark predicates with a created_at fallback for null publish dates', () => {
    const clause = buildUnreadClause(
      USER_ID,
      ['chan_a', 'chan_b'],
      new Map([
        ['chan_a', watermark],
        ['chan_b', null],
      ])
    );
    const orClause = (clause.AND as unknown as Array<{ OR?: unknown }>).find(
      (entry) => entry.OR != null
    );
    expect(orClause).toEqual({
      OR: [
        {
          channel_id: 'chan_a',
          OR: [
            { published_at: { gt: watermark } },
            { AND: [{ published_at: null }, { created_at: { gt: watermark } }] },
          ],
        },
        { channel_id: 'chan_b' },
      ],
    });
  });

  it('produces a clause that combines the per-channel OR and consumption guard', () => {
    const clause = buildUnreadClause(USER_ID, ['chan_a'], new Map([['chan_a', watermark]]));
    expect(clause).toEqual({
      AND: [
        {
          OR: [
            {
              channel_id: 'chan_a',
              OR: [
                { published_at: { gt: watermark } },
                { AND: [{ published_at: null }, { created_at: { gt: watermark } }] },
              ],
            },
          ],
        },
        { consumptions: { none: { user_id: USER_ID } } },
      ],
    });
  });
});

describe('buildVideoWhere — compositional sanity', () => {
  it('a complex query produces all expected keys', () => {
    const where = buildVideoWhere(
      {
        channelId: 'chan_a',
        starred: true,
        archived: false,
        from: '2026-01-01',
        tagIds: ['tag_x'],
      },
      USER_ID,
      CHANNEL_IDS
    );

    expect(where.channel_id).toBe('chan_a');
    expect(where.stars).toEqual({ some: { user_id: USER_ID } });
    expect(where.archives).toEqual({ none: { user_id: USER_ID } });
    expect(where.published_at).toEqual({ gte: new Date('2026-01-01') });
    expect(where.AND).toEqual([{ tags: { some: { tag_id: 'tag_x', user_id: USER_ID } } }]);
  });
});
