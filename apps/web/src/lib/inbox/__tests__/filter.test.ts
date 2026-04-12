import type { InboxQuery } from '@/lib/types';

import {
  encodeInboxQuery,
  extractInboxSearchParams,
  inboxQueriesEqual,
  isDefaultQuery,
  parseInboxQuery,
} from '../filter';

describe('parseInboxQuery', () => {
  it.each<{ url: string; expected: InboxQuery }>([
    { url: '', expected: {} },
    { url: 'q=hello', expected: { q: 'hello' } },
    { url: 'q=', expected: {} },
    { url: 'channelId=abc', expected: { channelId: 'abc' } },
    { url: 'folderId=f1', expected: { folderId: 'f1' } },
    { url: 'unread=1', expected: { unread: true } },
    { url: 'unread=true', expected: { unread: true } },
    { url: 'unread=0', expected: { unread: false } },
    { url: 'starred=1&saved=1', expected: { starred: true, saved: true } },
    { url: 'archived=1', expected: { archived: true } },
    { url: 'snoozed=1', expected: { snoozed: true } },
    { url: 'includeSnoozed=1', expected: { includeSnoozed: true } },
    { url: 'snoozed=1&includeSnoozed=1', expected: { snoozed: true, includeSnoozed: true } },
    { url: 'tagIds=a,b,c', expected: { tagIds: ['a', 'b', 'c'] } },
    { url: 'tagIds=', expected: {} },
    { url: 'tagIds=x,,y', expected: { tagIds: ['x', 'y'] } },
    { url: 'sort=newest', expected: { sort: 'newest' } },
    { url: 'sort=oldest', expected: { sort: 'oldest' } },
    { url: 'sort=bogus', expected: {} },
    { url: 'from=2026-01-01&to=2026-02-01', expected: { from: '2026-01-01', to: '2026-02-01' } },
    { url: 'unknown=value', expected: {} },
  ])('parses %s correctly', ({ url, expected }) => {
    const params = new URLSearchParams(url);
    expect(parseInboxQuery(params)).toEqual(expected);
  });
});

describe('encodeInboxQuery', () => {
  it.each<{ query: InboxQuery; expected: string }>([
    { query: {}, expected: '' },
    { query: { q: 'hello' }, expected: 'q=hello' },
    { query: { channelId: 'abc' }, expected: 'channelId=abc' },
    { query: { unread: true }, expected: 'unread=1' },
    { query: { unread: false }, expected: '' },
    { query: { starred: true, saved: true }, expected: 'starred=1&saved=1' },
    { query: { snoozed: true }, expected: 'snoozed=1' },
    { query: { tagIds: ['a', 'b'] }, expected: 'tagIds=a%2Cb' },
    { query: { tagIds: [] }, expected: '' },
    { query: { sort: 'newest' }, expected: '' },
    { query: { sort: 'oldest' }, expected: 'sort=oldest' },
  ])('encodes $query correctly', ({ query, expected }) => {
    expect(encodeInboxQuery(query).toString()).toEqual(expected);
  });

  it.each<InboxQuery>([
    {},
    { q: 'tech' },
    { channelId: 'ch1', unread: true },
    { tagIds: ['tag-a', 'tag-b'], starred: true },
    { from: '2026-01-01', to: '2026-02-01', sort: 'oldest' },
    { folderId: 'f1', archived: true, includeSnoozed: true },
    { snoozed: true },
  ])('round-trips %s through encode -> parse', (query) => {
    const encoded = encodeInboxQuery(query);
    const parsed = parseInboxQuery(encoded);
    expect(parsed).toEqual(query);
  });
});

describe('isDefaultQuery', () => {
  it.each<{ query: InboxQuery; expected: boolean }>([
    { query: {}, expected: true },
    { query: { sort: 'newest' }, expected: true },
    { query: { unread: false }, expected: true },
    { query: { tagIds: [] }, expected: true },
    { query: { q: 'x' }, expected: false },
    { query: { starred: true }, expected: false },
    { query: { sort: 'oldest' }, expected: false },
  ])('returns $expected for $query', ({ query, expected }) => {
    expect(isDefaultQuery(query)).toBe(expected);
  });
});

describe('inboxQueriesEqual', () => {
  it.each<{ desc: string; a: InboxQuery; b: InboxQuery; expected: boolean }>([
    { desc: 'two empty queries', a: {}, b: {}, expected: true },
    {
      desc: 'same booleans regardless of insertion order',
      a: { starred: true, saved: true },
      b: { saved: true, starred: true },
      expected: true,
    },
    {
      desc: 'mixed string + bool regardless of order',
      a: { channelId: 'abc', unread: true },
      b: { unread: true, channelId: 'abc' },
      expected: true,
    },
    {
      desc: 'absent boolean === false boolean',
      a: { starred: true },
      b: { starred: true, unread: false },
      expected: true,
    },
    {
      desc: 'absent string === empty string',
      a: { channelId: 'abc' },
      b: { channelId: 'abc', q: '' },
      expected: true,
    },
    {
      desc: 'tagIds compared as a set, order-independent',
      a: { tagIds: ['a', 'b', 'c'] },
      b: { tagIds: ['c', 'a', 'b'] },
      expected: true,
    },
    {
      desc: 'default sort === explicit "newest"',
      a: { starred: true },
      b: { starred: true, sort: 'newest' },
      expected: true,
    },
    {
      desc: 'differing booleans are not equal',
      a: { starred: true },
      b: { starred: true, saved: true },
      expected: false,
    },
    {
      desc: 'differing strings are not equal',
      a: { channelId: 'abc' },
      b: { channelId: 'def' },
      expected: false,
    },
    {
      desc: 'different sort orders are not equal',
      a: { sort: 'newest' },
      b: { sort: 'oldest' },
      expected: false,
    },
    {
      desc: 'different tag sets are not equal',
      a: { tagIds: ['a', 'b'] },
      b: { tagIds: ['a', 'c'] },
      expected: false,
    },
  ])('$desc', ({ a, b, expected }) => {
    expect(inboxQueriesEqual(a, b)).toBe(expected);
    // Symmetry
    expect(inboxQueriesEqual(b, a)).toBe(expected);
  });
});

describe('extractInboxSearchParams', () => {
  it('passes through plain inbox params unchanged when no `returnTo` is present', () => {
    const result = extractInboxSearchParams(new URLSearchParams('channelId=abc&starred=1'));
    expect(result.toString()).toBe('channelId=abc&starred=1');
  });

  it('returns the parsed `returnTo` value when present, ignoring siblings', () => {
    const raw = new URLSearchParams('returnTo=channelId%3Dabc%26starred%3D1&unread=1');
    const result = extractInboxSearchParams(raw);
    // The inner `returnTo` content wins; the outer `unread=1` is
    // dropped because the reader URL does not carry direct filter
    // params.
    expect(result.toString()).toBe('channelId=abc&starred=1');
  });

  it('strips an empty `returnTo` and keeps the rest', () => {
    const result = extractInboxSearchParams(new URLSearchParams('returnTo=&channelId=abc'));
    expect(result.toString()).toBe('channelId=abc');
  });

  it('returns an empty params object for an empty input', () => {
    const result = extractInboxSearchParams(new URLSearchParams(''));
    expect(result.toString()).toBe('');
  });

  it('does not alias the input — caller can mutate the result safely', () => {
    const raw = new URLSearchParams('channelId=abc');
    const result = extractInboxSearchParams(raw);
    result.set('starred', '1');
    expect(raw.toString()).toBe('channelId=abc');
  });

  it('preserves the InboxQuery `from` date-range filter (regression test)', () => {
    // The reader navigation context is named `returnTo` precisely to
    // avoid colliding with InboxQuery.from. Confirm a date-filtered
    // inbox URL passes through this helper without losing its `from`
    // (or `to`) keys.
    const result = extractInboxSearchParams(new URLSearchParams('from=2026-01-01&to=2026-02-01'));
    expect(result.get('from')).toBe('2026-01-01');
    expect(result.get('to')).toBe('2026-02-01');
  });

  it('still unwraps returnTo when a date `from` is also present in the inner query', () => {
    // The inner query has its own `from` date filter; the outer
    // wrapper is `returnTo`. The inner key must survive the unwrap.
    const inner = 'starred=1&from=2026-01-01';
    const raw = new URLSearchParams(`returnTo=${encodeURIComponent(inner)}`);
    const result = extractInboxSearchParams(raw);
    expect(result.get('starred')).toBe('1');
    expect(result.get('from')).toBe('2026-01-01');
  });
});
