import type { InboxQuery } from '@/lib/types';

import { encodeInboxQuery, isDefaultQuery, parseInboxQuery } from '../filter';

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
